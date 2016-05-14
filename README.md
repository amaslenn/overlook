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

## How to build
`$> cd overlook`  
`$> npm i -g nw-builder`  
`$> nwbuild -p win64 -v 0.12.3 .`  
