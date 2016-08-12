var Promise = require('promise');
var gerrit = require('./gerrit');

class Change {
    constructor(host, path, gerrit_json) {
        this.host = host;
        this.path = path;

        this.id = gerrit_json.id;
        this._number = gerrit_json._number;
        this.branch = gerrit_json.branch;
        this.project = gerrit_json.project;
        this.subject = gerrit_json.subject;

        // copy owner object exactly
        this.owner = gerrit_json.owner;

        // custom members
        this.has_code_review = false;
        this.code_reviews = {};
        this.code_review_sum = 0;

        this.is_verified = false;
        this.verifs = {};
        this.verif_sum = 0;

        this.changes_before = [];
        this.changes_after = [];
    }

    update_code_review(gerrit_json) {
        if (gerrit_json['labels'] &&
            gerrit_json['labels']['Code-Review'] &&
            gerrit_json['labels']['Code-Review']['all']) {
            var cr = gerrit_json['labels']['Code-Review']['all'];
            for (var i = cr.length - 1; i >= 0; i--) {
                if (cr[i].value) {
                    this.code_review_sum += cr[i].value;
                    if (! (cr[i].name in this.code_reviews)) {
                        this.code_reviews[cr[i].name] = {'value': 0};
                        this.code_reviews[cr[i].name]['avatar_url'] = cr[i].avatars[0].url;
                    }
                    this.code_reviews[cr[i].name]['value'] = cr[i].value;

                    this.has_code_review = true;
                }
            }
        } else {
            this.has_code_review = false;
            this.code_reviews = {};
        }
    }

    update_verified(gerrit_json) {
        if (gerrit_json['labels'] &&
            gerrit_json['labels']['Verified'] &&
            gerrit_json['labels']['Verified']['all']) {
            var cr = gerrit_json['labels']['Verified']['all'];
            for (var i = cr.length - 1; i >= 0; i--) {
                if (cr[i].value) {
                    this.verif_sum += cr[i].value;
                    if (! (cr[i].name in this.verifs)) {
                        this.verifs[cr[i].name] = {'value': 0};
                        this.verifs[cr[i].name]['avatar_url'] = cr[i].avatars[0].url;
                    }
                    this.verifs[cr[i].name]['value'] = cr[i].value;

                    this.is_verified = true;
                }
            }
        } else {
            this.is_verified = false;
            this.verifs = {};
        }
    }

    reviewed_by(user) {
        if (! this.has_code_review)
            return false;

        if (user in this.code_reviews)
            return true;

        return false;
    }

    get_code_review_sum() {
        return this.code_review_sum;
    }

    get_code_reviews() {
        return this.code_reviews;
    }

    get_verified_sum() {
        return this.verif_sum;
    }

    get_verified() {
        return this.verifs;
    }

    update_details() {
        var change = this;
        return new Promise(function(resolve, reject) {
            gerrit.get_change_details(change.host, change.path, change._number)
            .then(function(gerrit_json) {
                change.update_code_review(gerrit_json);
                change.update_verified(gerrit_json);
                // copy details to object
                if ('revisions' in gerrit_json) {
                    change.current_revision = Object.keys(gerrit_json.revisions)[0];
                }

            })
            .catch(function(e){ reject('from get_change_details(): '+e); })
        })
    }
}

module.exports = Change;
