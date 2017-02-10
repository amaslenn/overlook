# overlook
Pull changes from several Gerrit servers into one screen

## Settings example
`$HOME/.overlook/settings.yml` content for Gerrit's Gerrit
```yaml
amaslenn:
  name: 'Maslennikov, Andrey'
  projects:
    - host: gerrit-review.googlesource.com
      queries: ['status:open+project:gerrit']
  rules:
    submit_ready:
    - project: project-name // mandatory
      required_reviewers: [gerrit-user-name1, gerrit-user-name2]
      verified: True    // is Verified required
```

### Tips and tricks
For some servers you may need to specify `project.path` if your Gerrit server configured like `http://server.com/gerrit`:
```yaml
...
projects:
  - host: server.com
    path: gerrit
...
```

## Password
`overlook` uses your password as plain text since Gerrit API works in this way (ping me or submit PR if there is another way), so it is highly recommended to use Gerrit's HTTP password, see it in user settings on Gerrit Web.
When you tick `Save password` it will be stored as plain text, note it.
