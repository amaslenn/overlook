var gui = require('nw.gui');
var gerrit = require('./lib/gerrit');
var d3 = require('d3');
var open = require('open');
var yaml = require('js-yaml');
var fs = require('fs');


var win = gui.Window.get();
var tray;
var settings = {};
var d3_root;
var all_changes = {};

// win.showDevTools();

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

win.on('loaded', function() {
    win.show();
    d3_root = d3.select(document);

});

function load_data() {
    d3_root.select('#login').classed('hide', true);
    d3_root.select('#menu').classed('hide', false);
    start_loading();
    get_all_changes();
}

function refresh() {
    start_loading();
    d3_root.select('#gerrit_changes').selectAll('tbody').remove();
    all_changes = {};

    d3_root.selectAll('.reviewed-by-user').classed('reviewed-by-user', false);
    d3_root.selectAll('.user-is-owner').classed('user-is-owner', false);
    d3_root.selectAll('.submit-ready').classed('submit-ready', false);
    update_filtering();

    reset_filters();
    get_all_changes();
}

function check_login() {
    var usr = d3_root.select('#user').property('value');
    var pwd = d3_root.select('#password').property('value');
    var no_pwd = d3_root.select('#no_password').property('checked');

    if (usr == undefined || usr.length == 0)
        return;

    if ((pwd == undefined || pwd.length == 0) && !no_pwd)
        return;

    if (!load_user_settings(usr))
        return;

    // TODO: check all available projects
    gerrit.login(settings.projects[0].host, settings.projects[0].path, usr, pwd, initialize);
    return;
}

function get_all_changes() {
    start_loading();
    d3_root.select('#gerrit_changes').classed('hide', false);

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

    if (!settings[user] || settings[user].projects == undefined ||
        !settings[user].projects.length) {
        show_error('No projects for ' + user);
        return false;
    }
    settings = settings[user];

    return true;
}

function initialize(error, user) {
    if (error) {
        show_error(error);
        return;
    }

    d3_root.select('#login_btn').attr('disabled', null);
}

function OpenGerritLink(link) {
    open(link);
    return 0;
}

function update_changes_table(error, changes, host, path) {
    if (error) {
        d3_root.select('#gerrit_changes').classed('hide', true);
        all_changes = {};
        updater_loading_status();
        show_error(error);
        return;
    }

    var data = [];
    for (var index in changes) {
        if (changes[index]['_number'] in all_changes) {
            continue;
        }

        data.push(changes[index]);
    }

    columns = ['_number', 'CR', 'V', 'project', 'subject', 'owner'];
    var table = d3_root.select('#gerrit_changes'),
        tbody = table.append('tbody');

    // create a row for each object in the data
    var rows = tbody.selectAll('tr')
                        .data(data)
                        .enter()
                            .append('tr')
                            .attr('id', function(d) { return 'gid' + d['_number']; })
                            .classed('gerrit-change', true);

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
                if (column == 'owner') {
                    var owner = '<img class="avatar" src="' + row.owner.avatars[0].url + '"' +
                                ' title="' + row.owner.name + '"' +
                                '>' + row.owner.name;
                    obj.value = owner;
                }
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

    for (var index in data) {
        all_changes[data[index]['_number']] = {'sts': 'updating'};
        gerrit.get_change_details(host, path, data[index]['_number'], update_entry);
    }

    update_filtering();
}

function update_entry(data) {
    var reviewed_by_user = false;
    var code_review = 0;
    var reviewers = {};

    if (data['labels'] && data['labels']['Code-Review'] && data['labels']['Code-Review']['all']) {
        var cr = data['labels']['Code-Review']['all'];
        for (var i = cr.length - 1; i >= 0; i--) {
            if (cr[i].value) {
                code_review += cr[i].value;
                reviewers[cr[i].name] = cr[i].value;
                if (cr[i].name == settings.name)
                    reviewed_by_user = true;
            }
        }
    }
    if (code_review > 0)
        code_review = '+' + code_review;

    var verified = 0;
    if (data['labels']['Verified']['all']) {
        for (var i = data['labels']['Verified']['all'].length - 1; i >= 0; i--) {
            if (data['labels']['Verified']['all'][i].value)
                verified += data['labels']['Verified']['all'][i].value
        }
    }
    if (verified > 0)
        verified = '+' + verified;

    id = '#CR' + data['_number'] + '>span';
    d3_root.select(id).text(code_review);
    id = '#V' + data['_number'] + '>span';
    d3_root.select(id).text(verified);

    d3_root.select('#gid' + data['_number'])
        .classed('reviewed-by-user', reviewed_by_user);

    d3_root.select('#gid' + data['_number'])
        .classed('user-is-owner', data.owner.name == settings.name);

    if (settings.rules != undefined) {
        if (settings.rules.submit_ready != undefined) {
            for (var index in settings.rules.submit_ready) {
                var rule = settings.rules.submit_ready[index];

                // project is mandatory
                if (rule.project != undefined) {
                    if (rule.project != data.project)
                        continue;
                } else {
                    continue;
                }

                var verified_ok = true;
                if (rule.verified != undefined) {
                    if (rule.verified && !verified)
                        verified_ok = false;
                }

                var reviewers_ok = true;
                if (rule.required_reviewers != undefined) {
                    for (var index in rule.required_reviewers) {
                        var r = rule.required_reviewers[index];

                        // owner can't be required reviewer...
                        if (r == data.owner.name) {
                            // ... but his/her vote is important
                            if (r in reviewers && reviewers[r] <= 0)
                                reviewers_ok = false;
                            continue;
                        }

                        if (!(r in reviewers) || reviewers[r] <= 0)
                            reviewers_ok = false;
                    }
                }

                d3_root.select('#gid' + data['_number'])
                    .classed('submit-ready', verified_ok && reviewers_ok);

                update_filtering();
            }
        }
    }

    all_changes[data['_number']]['sts'] = 'updated';
    updater_loading_status();
}

function filter_all() {
    reset_filters();
    d3_root.select('#nav_all').classed('active', true);
    d3_root.select('#nav_review').classed('active', false);
    d3_root.select('#nav_submit').classed('active', false);

    update_filtering();
}

// this function hides reviewed and "my" changes
function filter_reviewed() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', false);
    d3_root.select('#nav_review').classed('active', true);
    d3_root.select('#nav_submit').classed('active', false);

    update_filtering();
}

function filter_submit_ready() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', false);
    d3_root.select('#nav_review').classed('active', false);
    d3_root.select('#nav_submit').classed('active', true);

    update_filtering();
}

function reset_filters() {
    update_filtering()
}

function start_loading() {
    d3_root.select('#loader').classed('loader', true);
}

function updater_loading_status() {
    var in_progress = false;
    for (var gid in all_changes) {
        if (all_changes[gid]['sts'] == 'updating')
            in_progress = true;
    }

    var showed = d3_root.select('#loader').classed('loader');

    if (in_progress != showed)
        d3_root.select('#loader').classed('loader', in_progress);

    update_filtering();
}

function update_filtering() {
    // getting currently selected tab
    var is_all_active = d3_root.select('#nav_all').classed('active');
    var is_review_active = d3_root.select('#nav_review').classed('active');
    var is_submit_active = d3_root.select('#nav_submit').classed('active');

    // defining number of changes per filter
    var num_all = Object.keys(all_changes).length;
    var num_review = num_all - d3_root.selectAll('.reviewed-by-user, .user-is-owner').size();
    var num_submit = d3_root.selectAll('.submit-ready').size();

    // updating badges
    d3_root.select('#all_num').text(num_all);
    d3_root.select('#review_num').text(num_review);
    d3_root.select('#submit_num').text(num_submit);

    // hide some changes
    if (is_all_active) {
        d3_root.selectAll('.gerrit-change').classed('hide', false);
    } else if (is_review_active) {
        d3_root.selectAll('.gerrit-change').classed('hide', false);
        d3_root.selectAll('.reviewed-by-user').classed('hide', true);
        d3_root.selectAll('.user-is-owner').classed('hide', true);
    } else if (is_submit_active) {
        d3_root.selectAll('.gerrit-change').classed('hide', true);
        d3_root.selectAll('.submit-ready').classed('hide', false);
    }
}

function show_error(error) {
    d3_root.select('#debug').html(error);
}
