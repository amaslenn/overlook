var gui = require('nw.gui');
var gerrit = require('../lib/gerrit');
var d3 = require('d3');
var open = require('open');
var yaml = require('js-yaml');
var fs = require('fs');
var Promise = require('promise');
var Handlebars = require('handlebars');
var Change = require('../lib/change');


var CONFIG_DIR = (process.env.HOME || process.env.USERPROFILE) + '/.overlook';
var SETTINGS_FILE = CONFIG_DIR + '/settings.yml';
var SESSION_FILE = CONFIG_DIR + '/session';


var win = gui.Window.get();
var tray;
var settings = {};
var user_config = {};
var session = {};
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
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR)
    } else {
        if (fs.existsSync(SETTINGS_FILE)) {
            settings = yaml.load(fs.readFileSync(SETTINGS_FILE));
        }

        if (fs.existsSync(SESSION_FILE)) {
            session = yaml.load(fs.readFileSync(SESSION_FILE));
        }
    }

    win.show();
    d3_root = d3.select(document);

    d3_root.select('#login_btn').on('click', load_data);
    d3_root.select('#btn-refresh').on('click', refresh);
    d3_root.select('#nav_all').on('click', filter_all);
    d3_root.select('#nav_review').on('click', filter_reviewed);
    d3_root.select('#nav_submit').on('click', filter_submit_ready);

    // restore user login/password from the last session
    if (session.last_user != undefined) {
        d3_root.select('#user').property('value', session.last_user);
        if (settings[session.last_user].password != undefined) {
            d3_root.select('#password').property('value', settings[session.last_user].password);
            if (settings[session.last_user].password == '') {
                d3_root.select('#password').property('placeholder', 'Empty password is used');
            }
            d3_root.select('#save_password').property('checked', true);
            d3_root.select('#login_btn').node().focus();
        } else {
            d3_root.select('#password').node().focus();
        }
    }

    // dynamically check if entered user name already present in settings and autofill
    // all found information
    d3_root.select('#user').on('input', function() {
        var probably_user = d3_root.select('#user').property('value');
        var found = false;
        if (probably_user in settings) {
            if (settings[probably_user].password != undefined) {
                d3_root.select('#password').property('value', settings[probably_user].password);
                if (settings[probably_user].password == '') {
                    d3_root.select('#password').property('placeholder', 'Empty password is used');
                }
                d3_root.select('#save_password').property('checked', true);
                found = true;
            }
        }

        if (!found) {
            d3_root.select('#password').property('value', '');
            d3_root.select('#password').property('placeholder', 'Password');
            d3_root.select('#save_password').property('checked', false);
        }
    });
});

function load_data() {
    if (check_login() != true) {
        show_error('Cannot login');
        return;
    }
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

    if (usr == undefined || usr.length == 0)
        return false;

    if (!load_user_config(usr))
        return false;

    // TODO: check all available projects
    gerrit.login(user_config.projects[0].host, user_config.projects[0].path, usr, pwd)
    .then(initialize)
    .catch(function(e) {
        show_error(e);
        return false;
    });

    session.last_user = usr;
    fs.writeFileSync(SESSION_FILE, yaml.dump(session));

    var save_password = d3_root.select('#save_password').property('checked');
    if (save_password) {
        settings[usr].password = pwd;
        fs.writeFileSync(SETTINGS_FILE, yaml.dump(settings));
    }

    return true;
}

function get_all_changes() {
    start_loading();
    d3_root.select('#gerrit_changes').classed('hide', false);

    var requests = [];
    for (var i = user_config.projects.length - 1; i >= 0; i--) {
        var host = user_config.projects[i].host;
        var path = user_config.projects[i].path;
        for (var j = user_config.projects[i].queries.length - 1; j >= 0; j--) {
            query = user_config.projects[i].queries[j];
            requests.push(gerrit.query_changes(host, path, query))
        }
    }

    Promise.all(requests)
    .then(values => {
        for (var res of values) {
            for (var ch of res.json) {
                if (ch['_number'] in all_changes) {
                    continue;
                }

                var c = new Change(res.host, res.path, ch);
                all_changes[c._number] = {'obj': c, 'sts': 'updating'};
            }
        }
        update_changes_table();
    })
    .catch(error => {
        d3_root.select('#gerrit_changes').classed('hide', true);
        all_changes = {};
        updater_loading_status();
        show_error(error);
    });
}

function load_user_config(user) {
    user_config = {};

    if (!(user in settings) || settings[user].projects == undefined ||
        !settings[user].projects.length) {
        show_error('No projects for ' + user);
        return false;
    }
    user_config = settings[user];

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

function update_changes_table() {
    var data = [];
    for (var chid in all_changes) {
        data.push(all_changes[chid].obj);
    }

    var source = d3_root.select('#template-row').html();
    var template = Handlebars.compile(source);
    var context = {'changes': data};

    var table = d3_root.select('#gerrit_changes');
    table.selectAll('tbody').remove();
    var tbody = table.append('tbody');
    tbody.html(template(context));

    var chunk_size = 10;
    var chunks = [];
    var temp = [];
    for (var i = 0; i < data.length; i++) {
        if (i && (i % chunk_size == 0)) {
            chunks.push(temp);
            temp = [];
        }
        temp.push(data[i]);
    }
    chunks.push(temp);

    var timeout = 600 * chunk_size;     // N ms per chunk
    for (var i in chunks) {
        (function(ind) {
            var chunk = chunks[ind];
            setTimeout(function() {
                var reqs = [];
                for (var ch of chunk) {
                    reqs.push(ch.update_details())
                }
                Promise.all(reqs)
                .then(values => {
                    for (var d of values) {
                        update_entry(d);
                    }
                })
                .catch(error => { show_error(error) })
            }, timeout * ind);
        })(i);
    }
}

function update_entry(change) {
    // get Core-Review/Verified values
    var reviewed_by_user = change.reviewed_by(user_config.name);
    var code_review = change.get_code_review_sum();
    if (code_review > 0)
        code_review = '+' + code_review;

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
    var id = '#CR' + change._number + '>span';
    d3_root.select(id).classed('review', true);
    d3_root.select(id).html(cr);

    id = '#V' + change._number + '>span';
    d3_root.select(id).html(v);

    d3_root.select('#gid' + change._number)
        .classed('reviewed-by-user', reviewed_by_user);

    d3_root.select('#gid' + change._number)
        .classed('user-is-owner', change.owner.name == user_config.name);

    if (user_config.rules != undefined) {
        var submit_ready = change.submit_ready(user_config.rules.submit_ready);

        // Only add class.
        // When changes are refreshed (or initialized), all classes are wiped out.
        if (submit_ready && change.mergeable())
            d3_root.select('#gid' + change._number).classed('submit-ready', true);

        update_filtering();
    }

    all_changes[change._number]['sts'] = 'updated';
    updater_loading_status();
}

function filter_all() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', true);
    d3_root.select('#nav_mine').classed('active', false);
    d3_root.select('#nav_review').classed('active', false);
    d3_root.select('#nav_submit').classed('active', false);

    update_filtering();
}

function filter_mine() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', false);
    d3_root.select('#nav_mine').classed('active', true);
    d3_root.select('#nav_review').classed('active', false);
    d3_root.select('#nav_submit').classed('active', false);

    update_filtering();
}

// this function hides reviewed and "my" changes
function filter_reviewed() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', false);
    d3_root.select('#nav_mine').classed('active', false);
    d3_root.select('#nav_review').classed('active', true);
    d3_root.select('#nav_submit').classed('active', false);

    update_filtering();
}

function filter_submit_ready() {
    reset_filters();

    d3_root.select('#nav_all').classed('active', false);
    d3_root.select('#nav_mine').classed('active', false);
    d3_root.select('#nav_review').classed('active', false);
    d3_root.select('#nav_submit').classed('active', true);

    update_filtering();
}

function reset_filters() {
    update_filtering()
}

function start_loading() {
    d3_root.select('#loader').classed('loader', true);
    d3_root.select('#btn-refresh').classed('disabled', true);
}

function updater_loading_status() {
    var in_progress = false;
    for (var gid in all_changes) {
        if (all_changes[gid]['sts'] == 'updating')
            in_progress = true;
    }

    var showed = d3_root.select('#loader').classed('loader');
    if (in_progress != showed) {
        d3_root.select('#loader').classed('loader', in_progress);
        d3_root.select('#btn-refresh').classed('disabled', in_progress);
    }

    update_filtering();
}

function update_filtering() {
    // getting currently selected tab
    var is_all_active = d3_root.select('#nav_all').classed('active');
    var is_mine_active = d3_root.select('#nav_mine').classed('active');
    var is_review_active = d3_root.select('#nav_review').classed('active');
    var is_submit_active = d3_root.select('#nav_submit').classed('active');

    // defining number of changes per filter
    var num_all = Object.keys(all_changes).length;
    var num_mine = d3_root.selectAll('.user-is-owner').size();
    var num_review = num_all - d3_root.selectAll('.reviewed-by-user, .user-is-owner').size();
    var num_submit = d3_root.selectAll('.submit-ready').size();

    // updating badges
    d3_root.select('#all_num').text(num_all);
    d3_root.select('#mine_num').text(num_mine);
    d3_root.select('#review_num').text(num_review);
    d3_root.select('#submit_num').text(num_submit);

    // hide some changes
    if (is_all_active) {
        d3_root.selectAll('.gerrit-change').classed('hide', false);
    } else if (is_mine_active) {
        d3_root.selectAll('.gerrit-change').classed('hide', true);
        d3_root.selectAll('.user-is-owner').classed('hide', false);
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
