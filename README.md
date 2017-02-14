# overlook
Pull changes from several Gerrit servers into one screen

## Settings example
`$HOME/.overlook/settings.yml` content for Gerrit's Gerrit
```
amaslenn:
  projects:
    - host: gerrit-review.googlesource.com
      queries: ['status:open+project:gerrit']
  rules:
    submit_ready:
    - project: project-name // mandatory
      required_reviewers: [gerrit-user-name1, gerrit-user-name2]
      verified: True    // is Verified required
```

## Run dev version
```sh
$ cd src
$ npm install
$ cd ..
# prepare dev env
$ export NWJS_BUILD_TYPE=sdk    # use `set` instead of `export` on Windows
# if you use proxy, set `https_proxy` to '', otherwise post install script may not work:
# GitHub issue: https://github.com/nwjs/npm-installer/issues/29#issuecomment-279671289
$ npm install
# run
$ npm run dev
```

## Build and package
```sh
$ npm run build
# or build just specific platform
$ npm run build-win
$ npm run build-lin
$ npm run build-osx
```
