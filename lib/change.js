class Change {
    constructor(gerrit_json) {
        this._number = gerrit_json._number;
        this.branch = gerrit_json.branch;
        this.project = gerrit_json.project;
        this.subject = gerrit_json.subject;

        // copy owner object exactly
        this.owner = gerrit_json.owner;

        this.has_code_review = false;
        this.code_reviews = {};
        this.code_review_sum = 0;

        this.is_verified = false;
        this.verifs = {};
        this.verif_sum = 0;
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
}

module.exports = Change;
