class Change {
    constructor(gerrit_json) {
        this._number = gerrit_json._number;
        this.branch = gerrit_json.branch;
        this.project = gerrit_json.project;
        this.subject = gerrit_json.subject;

        // copy owner object exactly
        this.owner = gerrit_json.owner;
    }
}

module.exports = Change;
