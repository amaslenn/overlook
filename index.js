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
    tray.tooltip = 'Overlook';

    tray.on('click', function() {
        win.show();
        this.remove();
        tray = null;
    });
});

var d3_root;
var all_changes = {};

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
            init_tabs();
        });
});

function init_tabs() {
    var svg = d3_root.select('#menu').append('svg')
        .attr('width', 500)
        .attr('height', 50);

    var buttons = svg.append('g').attr('id', 'buttons');

    var tabs = ['All', 'Review', 'Submit'];

    var def_color= '#ffffff';
    var hover_color= '#18A7FF';
    var press_color= '#1F77AD';

    var btn_group = buttons.selectAll('g.button')
        .data(tabs).enter()
            .append('g')
                .attr('class', 'button')
                .attr('id', function(d){ return 'btn-id-' + d })
                .style('cursor', 'pointer')
                .on('click', function(d,i) {
                    d3.select(this.parentNode).selectAll('rect')
                        .attr('fill', def_color);
                    d3.select(this).select('rect')
                        .attr('fill', press_color);
                })
                .on('mouseover', function() {
                    if (d3.select(this).select('rect').attr('fill') != press_color) {
                        d3.select(this)
                            .select('rect')
                            .attr('fill', hover_color);
                    }
                })
                .on('mouseout', function() {
                    if (d3.select(this).select('rect').attr('fill') != press_color) {
                        d3.select(this)
                            .select('rect')
                            .attr('fill', def_color);
                    }
                });

    var b_w = 50;
    var b_h = 25;
    var b_space = 10;
    var x0 = 0;
    var y0 = 10;
    btn_group.append('rect')
        .attr('width', b_w)
        .attr('height', b_h)
        .attr('x', function(d, i) { return x0 + (b_w + b_space) * i })
        .attr('y', y0)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', def_color)
        .attr('stroke', '#000000')
        .attr('stroke-width', 0.2);

    btn_group.append('text')
        .attr('id', function(d){ return 'btn-text-id-' + d })
        .attr('font-family', 'Helvetica,Calibri,Arial')
        .attr('font-size', 12)
        .attr('x',function(d,i) {
            return x0 + (b_w+b_space)*i + b_w/2;
        })
        .attr('y', y0 + b_h / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', 'black')
        .text(function(d){ return d });

    d3_root.select('#btn-id-All').select('rect').attr('fill', press_color);
}

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
    columns = ['_number', 'CR', 'V', 'project', 'subject', 'owner'];
    var table = d3.select(document.body).select('#gerrit').append('table'),
        thead = table.append('thead');
    // append the header row
    thead.append('tr')
        .selectAll('th')
        .data(columns)
            .enter()
            .append('th')
                .attr('data-title', function(column) { return column; })
                .html(function(column) {
                    return column == '_number' ? 'ID' :
                           column == 'subject' ? 'Subject' :
                           column == 'project' ? 'Project' :
                           column == 'review'  ? 'Review'  :
                           column == 'owner'   ? 'Owner'   : column;
                });
}

function update_changes_table(error, changes, host, path) {
    document.getElementById('debug').innerHTML = '';
    if (error) {
        document.getElementById('gerrit').innerHTML = error;
    }

    data = changes;

    columns = ['_number', 'CR', 'V', 'project', 'subject', 'owner'];
    var table = d3.select(document.body).select('#gerrit>table'),
        tbody = table.append('tbody');

    // create a row for each object in the data
    var rows = tbody.selectAll('tr')
                        .data(data)
                        .enter()
                            .append('tr')
                            .attr('id', function(d) { return 'gid' + d['_number']; });

    var i = 0;
    // create a cell in each row for each column
    var cells = rows.selectAll('td')
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
            .append('td')
            .attr('id', function(d){ return d.column + d.gid })
            .append('span')
            .html(function(d) {
                if (d.column == 'id') {
                    return '<span>' + (++i) + '</span>';
                }
                if (d.column == '_number') {
                    var link = 'https://' + host + (path ? '/' + path + '/' : '/') + '#/c/' + d.value;
                    return "<a href=javascript:void(0); onclick=\"OpenGerritLink('" + link + "');\"" + "\">"
                           + d.value + "</a>";
                }
                return d.value;
            });

    for (i in data) {
        all_changes[data[i]['_number']] = {};
        gerrit.get_change_details(host, path, data[i]['_number'], update_entry);
    }
    d3_root.select('#btn-text-id-All').text('All (' + Object.keys(all_changes).length + ')');
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
