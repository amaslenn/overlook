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
        this.owner_avatar_url = this.owner.avatars[0].url;
        this.link = 'https://' + this.host + (this.path ? '/' + this.path + '/' : '/')
                    + '#/c/' + this._number;

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

                if (change.current_revision != undefined) {
                    gerrit.get_change_relations(change.host, change.path, change.id, change.current_revision)
                    .then(function(d) {
                        var from_past = false;
                        change.changes_before = [];
                        change.changes_after = [];

                        // changes in git order: from newest to oldest
                        for (var c of d.changes) {
                            var id;
                            if ('_change_number' in c) {
                                if (c._change_number == change._number) {
                                    from_past = true;
                                    continue;
                                } else {
                                    id = c._change_number;
                                }
                            } else {
                                id = 'Merged commit';
                            }

                            if (from_past) {
                                change.changes_before.unshift(id);
                            } else {
                                change.changes_after.unshift(id);
                            }
                        }

                        resolve(change);
                    })
                    .catch(function(e){ reject('From get_change_relations(): '+e); })
                } else {
                    resolve(change);
                }
            })
            .catch(function(e){ reject('from get_change_details(): '+e); })
        })
    }

    mergeable() {
        var ready4merge = true;
        for (var c of this.changes_before) {
            if (c != 'Merged commit') {
                ready4merge = false;
            }
        }

        return ready4merge;
    }

    submit_ready(rules) {
        var ready = false;

        if (rules == undefined)
            return false;

        var cr_rev = this.get_code_reviews();

        for (var rule of rules) {
            // project is mandatory
            if (rule.project != undefined) {
                if (rule.project != this.project)
                    continue;
            } else {
                continue;
            }

            var verified_ok = true;
            if (rule.verified != undefined) {
                if (rule.verified && !this.get_verified_sum())
                    verified_ok = false;
            }

            var reviewers_ok = true;
            if (rule.required_reviewers != undefined) {
                // check mandatory reviewers scores
                for (var r of rule.required_reviewers) {
                    // owner can't be required reviewer...
                    if (r == this.owner.name) {
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

            if (verified_ok && reviewers_ok && no_minus_two && has_user_plus_two)
                ready = true;
        }

        return ready;
    }
}

module.exports = Change;
