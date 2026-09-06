# Contributing

This repo is public so people can **put their Omarchy setup in the archive**.
That is the contribution this project is looking for. Everything else — the
site itself, the ingest tooling, the design — is maintained privately and
changes there aren't being solicited.

## Add your setup

**Easiest:** [open a setup submission](https://github.com/jstamb/omarchy-archive/issues/new?template=setup-submission.yml).
Paste a link to your post, answer a few optional questions. Done.

**Direct:** open a pull request adding one object to `data/posts.json` and one
image to `public/images/posts/`. The shape is in the
[README](README.md#the-direct-way); every field is defined in
[`bot/schema.json`](bot/schema.json).

You do not need to install anything. CI runs the same validator the site build
runs and comments on the PR if a field is wrong.

## The rules

**Your work only.** The screenshot has to be yours to share, and the record
links back to your original post. Someone else's photo needs their say-so.

**Never invent an install command.** Every command on the site was read out of
`bin/` in the Omarchy repo or copied verbatim from the official plugin catalog.
If you don't know the exact command, leave `install.command` as `null` and fill
in `listing_url` — the page will show the menu path and link the listing. A
guessed command is worse than no command, and the validator rejects anything
that doesn't start with `omarchy` or that contains shell metacharacters.

**Images.** WebP, max 1200px on the long edge, quality ~80, under 400KB, named
`<id>.webp`. If you can't host it, set `image` to an `https://` URL and
`image_hosted: false` and it'll be linked instead of copied.

**Ids are permanent.** Pick a kebab-case id that reads well in a URL. Once
merged it never changes, because it becomes a link other people may have saved.

**Name your theme.** `related_theme_ids` is the reason this archive exists — it
turns your photo into a link on that theme's page, next to the command that
reproduces it. If you know what you're running, put it in.

## Taking something down

Open an issue with the link. It comes down. No argument, no negotiation, no
explanation needed — including if you're not the submitter but it's your photo.

## What CI checks

The same gate that runs on every deploy:

- duplicate ids, or ids that collide once slugified into a URL
- missing required fields, unknown `kind`, malformed dates
- duplicate `source_url` / `repo_url` — one record per upstream thing
- install commands that aren't `omarchy` commands, or contain shell metacharacters
- hosted images that don't exist, aren't WebP, or exceed 400KB
- `image_hosted` disagreeing with the image path
- `seen_on` / `related_*_ids` pointing at records that don't exist

If it's red, the message names the field and the reason.

## Not affiliated

Unofficial community site. Not affiliated with Omarchy, Omacom, or 37signals.
The official theme and plugin directories stay canonical; this indexes them and
links out.
