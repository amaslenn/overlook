var user;
var pass;

function prepare_options(host, pre_path, query) {
    var path = '/';
    if (pre_path != undefined)
        path = '/' + pre_path + '/';
    if (pass != undefined && pass)
        path += 'a/';
    path += 'changes/'

    if (query != undefined && query)
        path += '?q=' + query;

    opt = {
        auth: user + ':' + pass,
        host: host,
        path: path,
        method: 'GET'
    };

    return opt
}

module.exports = {

login: function(host, path, _user, _pass, fn) {
    var https = require('https');
    user = _user;
    pass = _pass;

    var options = prepare_options(host, path, 'status:open&n=1');

    data = ''
    https.get(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            err = 0;
            if (data == 'Unauthorized') {
                console.log('Error on login: Unauthorized');
                err = 1;
            } else {
                console.log('OK on login');
            }
            fn(err, user);
        });
        res.on('error', function(e) {
            console.log('Error on login:', e);
            fn(1, user);
        });
    });

    return;
},

query_changes: function(host, path, query, fn) {
    var https = require('https');

    var options = prepare_options(host, path, query + "&o=DETAILED_ACCOUNTS");

    var changes = [];
    var data = '';
    https.get(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            // slice(5) is for removing ")]}'"
            try {
                changes = JSON.parse(data.slice(5));
                fn(0, changes, host, path);
            } catch(e) {
                fn(e);
            }
        });
        res.on('error', function(e) {
            console.log(e);
            fn(e.message);
        })
    });

    return changes;
},

get_change_details: function(host, path, id, fn) {
    var https = require('https');

    var options = prepare_options(host, path, '');
    options.path += '/' + id + '/detail';

    var changes = [];
    var data = '';
    https.get(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            // console.log(data);
            if (data.trim() == 'Not found') {
                console.log('get_change_details(): no data for', id);
            } else {
                // slice(5) is for removing ")]}'"
                changes = JSON.parse(data.slice(5));
                fn(changes);
            }
        });
        res.on('error', function(e) {
            console.log("ERROR in get_change_details():", e.message);
            // fn(changes);
        })
    });

    return changes;
}

}
