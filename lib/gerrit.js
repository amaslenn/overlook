var user;
var pass;

module.exports = {

login: function(host, _user, _pass, fn) {
    var https = require('https');
    user = _user;
    pass = _pass;

    var options = {
        auth: user + ':' + pass,
        host: host,
        path: '/gerrit/a/changes/?q=status:open&n=1',
        method: 'GET'
    };

    console.log('Loging in', user + ':' + pass, '...');
    data = ''
    https.get(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            console.log('loading...');
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

query_changes: function(host, query, fn) {
    var https = require('https');

    var options = {
        auth: user + ':' + pass,
        host: host,
        path: '/gerrit/a/changes/?q=' + query,
        method: 'GET'
    };

    var changes = [];
    var data = '';
    https.get(options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            data += chunk;
        });
        res.on('end', function() {
            // slice(5) is for removing ")]}'"
            changes = JSON.parse(data.slice(5));
            // console.log(changes);
            fn(changes, host);
            // document.getElementById('gerrit').innerHTML = changes;
        });
        res.on('error', function(e) {
            changes = [e.message];
            fn(changes);
            // document.getElementById('gerrit').innerHTML = changes;
        })
    });

    return changes;
},

get_change_details: function(host, id, fn) {
    var https = require('https');

    var options = {
        auth: user + ':' + pass,
        host: host,
        path: '/gerrit/a/changes/' + id + '/detail',
        method: 'GET'
    };

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
            // changes = [e.message];
            console.log("ERROR in get_change_details():", e.message);
            // fn(changes);
            // document.getElementById('gerrit').innerHTML = changes;
        })
    });

    return changes;
}

}
