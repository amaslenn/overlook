# overlook
Pull changes from several Gerrit servers into one screen

## Settings example
`$HOME/.overlook/settings.yml` content for Gerrit's Gerrit
```
amaslenn:
  projects:
    - host: gerrit-review.googlesource.com
      queries: ['status:open+project:gerrit']
```
