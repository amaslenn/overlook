var gui = require('nw.gui');
var gerrit = require('./lib/gerrit');
var d3 = require('d3');
var open = require('open');
var yaml = require('js-yaml');
var fs = require('fs');
var Promise = require('promise');
var Change = require('./lib/change');


var win = gui.Window.get();
var tray;
var settings = {};
var d3_root;
var all_changes = {};

win.on('minimize', function() {
    win.hide();

    tray = new gui.Tray({ title: 'Overlook', icon: 'shield-warning.png' });
    tray.tooltip = 'Overlook';

    tray.on('click', function() {
        win.show();
        win.focus();
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
    gerrit.login(settings.projects[0].host, settings.projects[0].path, usr, pwd)
    .then(initialize)
    .catch(function(e) {
        show_error(e);
        return;
    });

    return;
}

function get_all_changes() {
    start_loading();
    d3_root.select('#gerrit_changes').classed('hide', false);

    for (var i = settings.projects.length - 1; i >= 0; i--) {
        host = settings.projects[i].host;
        path = settings.projects[i].path;
        for (var j = settings.projects[i].queries.length - 1; j >= 0; j--) {
            query = settings.projects[i].queries[j];
            gerrit.query_changes(host, path, query)
            .then(function(res) {
                update_changes_table(res.json, res.host, res.path);
            })
            .catch(function(e) {
                d3_root.select('#gerrit_changes').classed('hide', true);
                all_changes = {};
                updater_loading_status();
                show_error(error);
            });
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

function initialize() {
    d3_root.select('#debug').html('');
    d3_root.select('#login_btn').attr('disabled', null);
}

function OpenGerritLink(link) {
    open(link);
    return 0;
}

function update_changes_table(changes, host, path) {
    var data = [];
    for (var ch of changes) {
        if (ch['_number'] in all_changes) {
            continue;
        }

        var c = new Change(ch);
        all_changes[c._number] = {'obj': c, 'sts': 'updating'};
        data.push(c);
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
                    gid: row['_number'],
                    branch: row['branch']
                };
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
                } else if (d.column == '_number') {
                    var link = 'https://' + host + (path ? '/' + path + '/' : '/') + '#/c/' + d.value;
                    return "<a href=javascript:void(0); onclick=\"OpenGerritLink('" + link + "');\"" + "\">"
                           + d.value + "</a>";
                } else if (d.column == 'project') {
                    return d.value + ' (' + d.branch + ')';
                }
                return d.value;
            });

    for (var ch of data) {
        gerrit.get_change_details(host, path, ch['_number'])
        .then(function(d) {
            update_entry(d);
        })
        .catch(function(error) {
            show_error(error);
        })
    }

    update_filtering();
}

function update_entry(data) {
    var change = all_changes[data['_number']]['obj'];

    // get Core-Review/Verified values
    change.update_code_review(data);
    var reviewed_by_user = change.reviewed_by(settings.name);
    var code_review = change.get_code_review_sum();
    if (code_review > 0)
        code_review = '+' + code_review;

    change.update_verified(data);
    var verified = change.get_verified_sum();
    if (verified > 0)
        verified = '+' + verified;

    // show reviews
    var cr = '<span class="review_sum">' + code_review + '</span>';
    var cr_rev = change.get_code_reviews();
    for (var r in cr_rev) {
        cr += '<span class="review_one"><img class="avatar" src="' + cr_rev[r].avatar_url + '"' +
                ' title="' + (cr_rev[r].value > 0 ? '+' : '') + cr_rev[r].value + ' by ' + r + '">' +
                '<span class="review_one_val ' + (cr_rev[r].value > 0 ? 'review_good' : 'review_bad') +
                '">' + (cr_rev[r].value > 0 ? '+' : '–') + '</span></span>';
    }

    var v = '<span class="review_sum">' + verified + '</span>';
    var v_rev = change.get_verified();
    for (var r in v_rev) {
        v += '<span class="review_one"><img class="avatar" src="' + v_rev[r].avatar_url + '"' +
                ' title="' + (v_rev[r].value > 0 ? '+' : '') + v_rev[r].value + ' by ' + r + '">' +
                '<span class="review_one_val ' + (v_rev[r].value > 0 ? 'review_good' : 'review_bad') +
                '">' + (v_rev[r].value > 0 ? '+' : '–') + '</span></span>';
    }

    // Update filtering
    var id = '#CR' + data['_number'] + '>span';
    d3_root.select(id).classed('review', true);
    d3_root.select(id).html(cr);

    id = '#V' + data['_number'] + '>span';
    d3_root.select(id).html(v);

    d3_root.select('#gid' + data['_number'])
        .classed('reviewed-by-user', reviewed_by_user);

    d3_root.select('#gid' + data['_number'])
        .classed('user-is-owner', data.owner.name == settings.name);

    if (settings.rules != undefined) {
        if (settings.rules.submit_ready != undefined) {
            for (var rule of settings.rules.submit_ready) {
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
                    // check mandatory reviewers scores
                    for (var r of rule.required_reviewers) {
                        // owner can't be required reviewer...
                        if (r == data.owner.name) {
                            // ... but his/her vote is important
                            if (r in cr_rev && cr_rev[r].value <= 0)
                                reviewers_ok = false;
                            continue;
                        }

                        if (!(r in cr_rev) || cr_rev[r].value <= 0)
                            reviewers_ok = false;
                    }

                    // check all reviewers scores
                    for (var r in cr_rev) {
                        if (cr_rev[r].value < 0) {
                            reviewers_ok = false;
                        }
                    }
                }

                var no_minus_two = true;
                for (var r in cr_rev) {
                    if (cr_rev[r].value == -2) {
                        no_minus_two = false;
                        break;
                    }
                }

                var has_user_plus_two = true;
                if (rule.has_user_plus_two != undefined) {
                    for (var r of rule.has_user_plus_two) {
                        if (r in cr_rev) {
                            if (cr_rev[r].value != 2)
                                has_user_plus_two = false;
                        } else {
                            has_user_plus_two = false;
                        }
                    }
                }

                // Only add class.
                // When changes are refreshed (or initialized), all classes are wiped out.
                if (verified_ok && reviewers_ok && no_minus_two && has_user_plus_two)
                    d3_root.select('#gid' + data['_number'])
                        .classed('submit-ready', true);

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
