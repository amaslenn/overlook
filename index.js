var gui = require('nw.gui');
var gerrit = require('./lib/gerrit');
var d3 = require('d3');
var open = require('open');
var yaml = require('js-yaml');
var fs = require('fs');


var win = gui.Window.get();
var tray;
var settings = {};

//win.showDevTools();

win.on('minimize', function() {
    this.hide();

    tray = new gui.Tray({ title: 'Overlook', icon: 'shield-warning.png' });
    tray.tooltip = "Overlook";

    tray.on('click', function() {
        win.show();
        this.remove();
        tray = null;
    });
});

win.on('loaded', function() {
    win.show();
    d3_root = d3.select(document);

    var check = function() {
        usr = document.getElementById('usr').value;
        pwd = document.getElementById('pwd').value;
        no_pwd = d3_root.select('#no_pwd').property('checked');

        if (usr == undefined || usr.length == 0)
            return;

        if ((pwd == undefined || pwd.length == 0) && !no_pwd)
            return;

        if (!load_user_settings(usr))
            return;

        // TODO: check all available projects
        gerrit.login(settings.projects[0].host, settings.projects[0].path, usr, pwd, initialize);
        return;
    };
    login = d3_root.select('#login').append('form')
        .style('margin', 'auto')
        .style('width', '30%');
    login.append('input')
        .attr('type', 'text')
        .attr('id', 'usr')
        .on('change', check);
    login.append('br');
    login.append('input')
        .attr('type', 'password')
        .attr('id', 'pwd')
        .on('change', check);
    login.append('br');
    login.append('input')
        .attr('type', 'checkbox')
        .attr('id', 'no_pwd')
        .attr('value', 'password')
        .on('change', function() {
            checked = d3_root.select('#no_pwd').property('checked');
            d3_root.select('#pwd').attr('disabled', checked);
            check();
        });
    login.append('label').text('No password');
    login.append('br');
    login.append('input')
        .attr('type', 'button')
        .attr('value', 'Go!')
        .attr('disabled', true)
        .attr('id', 'login_btn')
        .on('click', function() {
            d3_root.select('#login').remove();
            document.getElementById('debug').innerHTML = 'Loading...';
            get_all_changes();
            d3_root.select('#menu').append('div')
                .append('input')
                    .attr('type', 'button')
                    .attr('value', 'Refresh')
                    .attr('id', 'refresh_btn')
                    .on('click', function() {
                        d3_root.select('#gerrit').selectAll('*').remove();
                        get_all_changes();
                    });
        });
});

function get_all_changes() {
    console.log('IN get_all_changes()');

    create_changes_table();

    for (var i = settings.projects.length - 1; i >= 0; i--) {
        host = settings.projects[i].host
        path = settings.projects[i].path
        for (var j = settings.projects[i].queries.length - 1; j >= 0; j--) {
            query = settings.projects[i].queries[j]
            gerrit.query_changes(host, path, query, update_changes_table);
        }
    }
}

function load_user_settings(user) {
    settings = {};

    cfg_dir = (process.env.HOME || process.env.USERPROFILE) + '/.overlook';
    if (!fs.existsSync(cfg_dir)) {
        fs.mkdirSync(cfg_dir)
    } else {
        settings_file = cfg_dir + '/settings.yml';
        if (fs.existsSync(settings_file)) {
            settings = yaml.load(fs.readFileSync(settings_file));
        } else {
            obj = {};
            obj[user] = {'projects': []};
            fs.writeFileSync(settings_file, yaml.dump(obj));
        }
    }

    if (!settings[user] || !settings[user].projects) {
        document.getElementById('gerrit').innerHTML = 'No projects for ' + user;
        return false;
    }
    settings = settings[user];

    return true;
}

function initialize(error, user) {
    document.getElementById('gerrit').innerHTML = '';

    if (error) {
        document.getElementById('debug').innerHTML = '';
        document.getElementById('gerrit').innerHTML = 'Error!';
        document.getElementById('pwd').value = ''
        return;
    }

    d3_root.select('#login_btn').attr('disabled', null);
}

function OpenGerritLink(link) {
    open(link);
    return 0;
}

function create_changes_table(argument) {
    columns = ['id', 'CR', 'V', '_number', 'project', 'subject', 'owner'];
    var table = d3.select(document.body).select('#gerrit').append("table"),
        thead = table.append("thead");
    // append the header row
    thead.append("tr")
        .selectAll("th")
        .data(columns)
            .enter()
            .append("th")
                .attr("data-title", function(column) { return column; })
                .html(function(column) {
                    return column == "_number" ? "ID" :
                           column == "id"      ? "#" :
                           column == "subject" ? "Subject" :
                           column == "project" ? "Project" :
                           column == "review"  ? "Review"  :
                           column == "owner"   ? "Owner"   : column;
                });
}

function update_changes_table(error, changes, host, path) {
    document.getElementById('debug').innerHTML = '';
    if (error) {
        document.getElementById('gerrit').innerHTML = error;
    }

    data = changes;

    columns = ['id', 'CR', 'V', '_number', 'project', 'subject', 'owner'];
    var table = d3.select(document.body).select('#gerrit>table'),
        tbody = table.append("tbody");

    // create a row for each object in the data
    var rows = tbody.selectAll("tr")
                        .data(data)
                        .enter()
                            .append("tr")
                            .attr('id', function(d) { return 'gid' + d['_number']; });

    var i = 0;
    // create a cell in each row for each column
    var cells = rows.selectAll("td")
        .data(function(row) {
            return columns.map(function(column) {
                obj = {
                    column: column,
                    value: row[column],
                    gid: row['_number']
                };
                if (column == 'created' || column == 'updated')
                    obj.value = (new Date(row[column])).toLocaleString();
                if (column == 'owner')
                    obj.value = row.owner.name;
                return obj;
            });
        })
        .enter()
            .append("td")
            .attr('id', function(d){ return d.column + d.gid })
            .append("span")
            .html(function(d) {
                if (d.column == 'id') {
                    return "<span>" + (++i) + "</span>";
                }
                if (d.column == '_number') {
                    var link = 'https://' + host + (path ? '/' + path + '/' : '/') + '#/c/' + d.value;
                    return "<a href=javascript:void(0); onclick=\"OpenGerritLink('" + link + "');\"" + "\">"
                           + d.value + "</a>";
                }
                return d.value;
            });

    for (i in data) {
        gerrit.get_change_details(host, path, data[i]['_number'], update_entry);
    }
}

function update_entry(data) {
    // console.log('IN update_entry(', data, ')');
    reviewed_by_user = false;
    code_review = 0;
    if (data['labels'] && data['labels']['Code-Review'] && data['labels']['Code-Review']['all']) {
        for (var i = data['labels']['Code-Review']['all'].length - 1; i >= 0; i--) {
            if (data['labels']['Code-Review']['all'][i].value) {
                code_review += data['labels']['Code-Review']['all'][i].value
                if (data['labels']['Code-Review']['all'][i].name == settings.name)
                    reviewed_by_user = true
            }

        }
    }
    if (code_review > 0)
        code_review = '+' + code_review

    verified = 0;
    if (data['labels']['Verified']['all']) {
        for (var i = data['labels']['Verified']['all'].length - 1; i >= 0; i--) {
            if (data['labels']['Verified']['all'][i].value)
                verified += data['labels']['Verified']['all'][i].value
        }
    }
    if (verified > 0)
        verified = '+' + verified

    id = '#CR' + data['_number'] + '>span';
    d3.select(document).select(id).html(code_review);
    id = '#V' + data['_number'] + '>span';
    d3.select(document).select(id).html(verified);

    d3.select(document).select('#gid' + data['_number'])
        .classed('reviewed-by-user', reviewed_by_user);

    d3.select(document).select('#gid' + data['_number'])
        .classed('user-is-owner', data.owner.name == settings.name);
}
