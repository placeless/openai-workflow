## Summary

- 

## Verification

- [ ] `plutil -lint info.plist prefs.plist`
- [ ] `python3 -m json.tool config/alfred/la.json`
- [ ] `for script in scripts/*.js; do osacompile -l JavaScript -o "/tmp/$(basename "$script" .js).scpt" "$script"; done`
- [ ] Manual Alfred workflow check, if UI/routing behavior changed

## Safety

- [ ] No API keys, private prompts, or local config files are included
- [ ] Generated workflow exports and scratch files are not included
