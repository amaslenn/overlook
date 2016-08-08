var Promise = require('promise');

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

login: function(host, path, _user, _pass) {
    var https = require('https');
    user = _user;
    pass = _pass;

    var options = prepare_options(host, path, 'status:open&n=1');

    return new Promise(function(resolve, reject) {
        data = ''
        https.get(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                if (data == 'Unauthorized') {
                    console.log('Error on login: Unauthorized');
                    reject('Error on login: Unauthorized');
                } else {
                    console.log('OK on login');
                }
                resolve();
            });
            res.on('error', function(e) {
                console.log('Error on login:', e);
                reject('Error on login: ' + e);
            });
        });
    });
},

query_changes: function(host, path, query) {
    var https = require('https');

    var options = prepare_options(host, path, query + "&o=DETAILED_ACCOUNTS");

    return new Promise(function(resolve, reject) {
        var changes = [];
        var data = '';
        https.get(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                try {
                    // slice(5) is for removing ")]}'"
                    changes = JSON.parse(data.slice(5));
                    resolve({'json': changes, 'host': host, 'path': path});
                } catch(e) {
                    reject('Invalid data from server');
                }
            });
            res.on('error', function(e) {
                console.log(e);
                reject(e);
            });
        });
    });
},

get_change_details: function(host, path, id) {
    var https = require('https');

    var options = prepare_options(host, path, '');
    options.path += '/' + id + '/detail';

    return new Promise(function(resolve, reject) {
        var changes = [];
        var data = '';
        https.get(options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                if (data.trim() == 'Not found') {
                    reject('get_change_details(): no data for ' + id);
                } else {
                    // slice(5) is for removing ")]}'"
                    try {
                        changes = JSON.parse(data.slice(5));
                        resolve(changes);
                    } catch(e) {
                        reject('Invalid data from server');
                    }
                }
            });
            res.on('error', function(e) {
                reject("ERROR in get_change_details():", e.message);
            })
        });
    });
}

}
