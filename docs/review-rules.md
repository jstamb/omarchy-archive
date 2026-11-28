# Omarchy Archive review rules

Source of truth for writing and self-reviewing records. Part A is the consolidated rules (parts 1-31). Part B is the standing style rules from STYLE-RULES.md; where they overlap, Part A wins.

## Part A: consolidated rules (1-31)

1/20 TITLES: no relative/recency time words (just, already, about to, today, tonight, latest, newest, new in, this week's); state the change, never a change-marking "now", even inside a quote; "Now With" stays allowed only in version titles.

2/20 Third person, house present tense for the poster's own acts ("Found" -> "Finds", "Made" -> "Makes", never "Ships" unless they say shipped/released); keep the poster's tense when reporting others' changes. Keep capability as capability ("Can Use X"); keep a time qualifier on a limitation ("for Now Only for X").

3/20 Hedged or ongoing work stays ongoing ("Is Trying to Build", "Is Building", "Is Shipping It"); announced-not-shipped never titled as delivered. "incoming!" or unreleased with a target = preview ("Previews X, Aiming to Launch…"), never "Introduces"/"Is Shipping"; "later today" = "Due for Release".

4/20 Rhetorical question = ask ("Asks Whether to…"); offer = offer ("Offers to Open a PR"); a celebration of a release is never "Runs it". PR work: title by PR state ("in an Open PR"), keep the poster's verb; a same-post PR to official packages, or a same-thread reply completing the ask, goes in the title.

5/20 A poster's claim about their own result is quoted or credited ("Says They Ran…", "Reports … on Their Air"), never stated as fact or credited to the release. Third-party partnership claims are attributed ("Says Omarchy Is Teaming Up With…"); a correction post names what it corrects.

6/20 Verbless titles only when reproducing the poster's headline or a quote; otherwise use a real house verb; never coin verbs; "Version" never follows a version number. Version titles keep purpose and change separate: "<Product> vX Does Y, Now With Z". House casing for every product name outside quotes; official vendor spacing for hardware models; lowercase "v" in versions; "%" not "Percent".

7/20 Fix word-order slips and misspelled product names outside quotes; never carry a slip into a title, and never build a title from a meaning-changing slip. Work titles: first-person titles go verbatim in quotes; a printed date goes in parentheses after the closing quote ('"Today in Omarchy" (16-Oct-2026)').

8/20 Home-screen apps are "Web App"; never put a phone app "on Omarchy"; "Running Native Omarchy", never "Under". A poster's own evaluative word for their product may stay; never add evaluative words. QUOTES: re-check every quoted figure and phrase against the source; punctuation, arrows and separators verbatim; never insert glyphs or glue lines; slips stay verbatim with no [sic].

9/20 Quote a qualifier that immediately follows a quoted clause; keep digest money/status/evidence words and caveats; never turn asides into causal links. "They end"/"ending" only for the true last line, otherwise "They add".

10/20 TRANSLATIONS: by sense (idioms, time phrases like 今から見れる = "starting now", domain UI terms, no false friends); numbers exact; keep every clause, time word and the poster's voice.

11/20 Add "I" only when the verb carries it (hice = "I made"); never add "they"; use the poster's own English verbatim; slips and typos stay in the translation, but the title uses the intended meaning (背景蘑菇 -> "Background Blur"). Quote and translate a trailing non-English line, never "ending in Japanese".

12/20 SUMMARIES: cite the source, never the archive; name the quoted post when the point depends on it, when the post reworks its image, or when the poster quotes their own earlier wish. Include a same-thread reply that changes how the still reads; a reply in a product's thread is about that product. Comments by others are "under the name X"; no handle possessives outside quotes ("a dhh post").

13/20 Describe links by where they land; a dead or misspelled repo link is "linking <product>'s GitHub repo" and never corrected; a working link on the poster's other handle is fine. Never describe a third-party app with another product's name.

14/20 IMAGES: mention every image (at least as a group); name the hosted image first as "The hosted image", with its place in the post only as an aside; never use a wrong ordinal; a non-hosted extra image is "a second image", never "a note". The still must show the feature announced; no mid-typing title cards; check video/GIF frames before setting image null.

15/20 Describe only what is visible: no OS claim without UI, no time of day from sky colors, no completing cut-off labels, no invented row labels; colors on the right object. Read numbers at zoom and check chart arithmetic; list table rows in real order; "each"/"all" must hold for every item; name controls by on-screen type; quote on-screen URLs exactly.

16/20 Never name people, landmarks, rockets, vehicle models or fictional characters from an image alone; describe them by visible clothing and features; no "cosplay", "creature", "sprites" or ethnic labels; describe exactly what is worn ("feathers in their hair").

17/20 RELATED IDS: match only on an exact catalog listing or repo link (including a catalog repo_url that now redirects), an id printed in the poster's own still, an id in the poster's own install command when they are a repo member, or the poster's own named plugin from their own repo.

18/20 Never match on name alone across authors (same-named launchers or plugins by others stay []); a link to an id not in the catalog stays []. When a match rests on a link but authorship can't be tied to the poster, state no authorship beyond their quoted words. When the catalog later adds a plugin an earlier record links exactly, backfill that record's related_plugin_ids in the next fixes.

19/20 Theme ids: an official built-in theme counts only when it is the post's subject; never for screenshot styling or a "treatment" of other art; an event name containing a theme name ("Omarchy Tokyo Night" meetup) never counts. Product names may come from the slug of the poster's own link, never from the linked page's text alone; credit someone else's theme as "Shares".

20/20 KIND AND DUPLICATES: a software widget for a peripheral is kind "plugin"; a different account adding something new to an archived feature is a distinct record.

21/22 NEVER use "Under Omarchy" outside quotes, even when the poster writes "under Omarchy Linux"; say "Omarchy on <machine>" or "Running Omarchy". The poster's wording stays inside quotes.

22/22 A catalog entry from the poster's own GitHub account counts as their own named plugin even when its repo differs from the linked one (mark-omarov/omanow vs omanow-plugin, no redirect), provided the post names the plugin as theirs.

23/24 An unlinked "my <Plugin>" matches when the same X account earlier claimed that exact listing in first person with a link (ronin_lab "Our 0.7.0 version" + Orbit listing) and it is the only catalog plugin by that name. On-screen usernames (rohan, /home/rohan) support but never establish a cross-handle identity alone.

24/24 Backfill scans must ignore umbrella repos: a link to omacom/omarchy (PRs, releases, commits) never matches omarchy.dock or any first-party entry whose repo_url is the main Omarchy repo; match only the exact plugin repo or listing.

25/26 A link-only post that quotes its own earlier post may host one of that quoted post's images, named "The hosted image, the Nth of that quoted post"; prefer an image not already hosted on another record, and never reuse the same image file across records.

26/26 Cross-handle identity needs evidence, not a shared name: a catalog theme by another GitHub account (Oligarchy by EF-Code) stays [] for a poster whose own repos are elsewhere (erikrjohansson = ejuro). A link the poster drops in a later reply to plug a different product of theirs never matches the record's subject.

27/28 GitHub owner and repo names are case-insensitive: a link differing from a catalog repo_url only in casing (Madmasx vs madmasx) is an exact match. "Now With" never goes on a first release, even in a version title; there is nothing earlier for it to change from.

28/28 Backfill scans must cover records whose source tweets predate the scrape-run folders: re-read those originals and their same-thread replies read-only on X before ruling (madmasx-hermes-pets linked madmasx/hermes-pets-omarchy and was missed). A media-only reply is not a link.

29/31 On X, a long post keeps its links in note_tweet entities, not in the top-level entities; read both before calling a post linkless. A plain-text "owner/repo" written by that repo owner (klaudworks: "check out klaudworks/omadoro on github") counts as the poster's own named plugin from their own repo.

30/31 A link to an issue or PR inside a plugin repo (wesleygrimes/omastorm/issues/107) is not a repo link and never matches. Neither does an upstream repo the poster says they are forking (davidfano → awkent01): match their fork only once it has its own catalog entry and link.

31/31 Backfill scans also run against the archive itself: any record whose summary or title names an "owner/repo" or a listing id that is in the catalog, while its related ids leave it out, is a candidate. Verify each original on X before backfilling.

## Part B: standing style rules


## Title / summary ALWAYS

- Titles/summaries stay third person (no you/your) except a printed "Your" on a card that is quoted as the card's own line.
- A post's question stays a question in the title.
- An em dash the post doesn't use becomes a colon or hyphen.
- Drop top-bar clocks (omit; never narrate the drop).
- US spelling outside quotes; house casing (Omarchy, macOS, GitHub, Steam Deck).
- Never put domains, URLs, or install commands in title/summary.
- Never invent wallpaper scenery or logo details; describe only what the Read tool shows on THIS image.
- Call a 1-frame webp a still, never a video frame.
- Never open a summary with a handle possessive; use "<handle> posts/says…" and they/their after the first mention.
- **Never use a handle possessive outside quotes** (write "a dhh post", not "dhh's post"; use they/their after the first mention).
- **No relative times in titles** ("Right Now", "Today", "Later Today", "Tonight", "tomorrow", "Latest", "Newest", "This Week's"); keep them only inside a summary quote.
- featured: ALWAYS false.
- related_*_ids: set related ids when the post links a repo whose plugins.json/themes.json repo_url matches exactly; or, when the post names the poster's own plugin without linking, set the id only if that exact name maps to exactly one plugins.json entry from the poster's own repo or author; never match on name alone across authors (e.g. tcballard Familiar is not io.github.tuxclaw.familiar; NixFred Blip is not io.github.yogeshojha.blip). A related id may also rest on an exact catalog-listing or repo link in the post or the poster's follow-up even when the catalog author can't be tied to the poster; then the summary must not state authorship beyond the poster's own quoted words.
- author_url https://x.com/handle; source_platform "x"; seen_on null.
- created_at/added_at = UTC post day YYYY-MM-DD.
- Expand t.co with curl -sI Location.
- Images from media URLs; text-only → image null, image_hosted false.
- For media posts: download to imgs/, READ with Read tool (and PIL crop/upscale for small text) before writing summaries.
- Never write paths/placeholders into JSON; append whole array; count must never drop.
- Id slug: lowercase handle-kebab; permanent.

## Also keep (from batch 719b51a Extra rules)

- No relative times in titles ("Later Today", "tonight", "tomorrow", "Latest", "Newest", "This Week's"): drop them; name what the item covers instead.
- Never use a handle possessive anywhere ("a dhh post", not "dhh's post").

These two were restored 2026-10-09 after SEO Reports noted they were missing from the last two DISPATCH files.

## Also keep (from batch 5a50586 Extra rules)

- In digests, keep the poster's tense and evidence words: never turn "will require" into "requires" or "the reported … delay fell" into "measured"; when a cost or result is caveated, quote the caveat.
- House casing covers every product name outside quotes, not only the listed four: "PhotoShop-Like" in a title becomes "Photoshop-Like"; the poster's "PhotoShop" stays only inside quotes.

## Also keep (from batch c032a31 Extra rules)

- "No relative times in titles" also covers recency words such as "Latest", "Newest" and "This Week's", which go stale as soon as the next issue ships. Name what the item covers instead ("The Latest Omarchy Weekly Is Out" → "Omarchy Weekly Is Out, With New Sponsors and Disktree Becoming Default"). A date suffix in an id (gregmolnar-omarchy-weekly-oct-10) is absolute and allowed.
- A poster's slip stays verbatim inside quotes: no [sic], no inserted word ("They require now, so a rubber ducky will be less effective!" stays as posted). Never carry the slip into a title or other unquoted text, and never "correct" it into a word the poster didn't write. Drop it ("Agent-Native Full Pledge Window Manager" → "Agent-Native Window Manager").
- The "under the name X" attribution covers every captured comment, reply or message by someone other than the poster, not only X posts: a GitHub comment in a photo is 'a "Collaborator" reply under the name omarchybot', never 'an omarchybot reply'.

## Also keep (from batch 0be32a5 Extra rules)

- Blank thumbnail on a GIF/video: check the media file's frames before setting image null. If any frame is usable, mirror the cleanest one (title card or main UI) and describe it as the still.
- A poster's own evaluative word for their own product may stay in a title when it reads as their description under their handle. Do not add evaluative words the poster did not use.

## Also keep (from batch 241b50d Extra rules)

- A named work's own title (X article, blog post, video) that is in first person goes into the record title verbatim inside straight quotes, never rewritten to third person and never left unquoted. Example: OneLegDavePDX: "Omarchy, Please Meet My Mac".
- "They end" / "ending" only for a source's actual last line; otherwise use "They add".
- Describe a post's non-hosted extra image as "a second image" with what it is, never as "a note" (which reads as a Community Note), and keep its status qualifiers. Example: 'A second image is a terminal note reading "...all 66 tests pass..." and "Its final review is running."'.

## Also keep (from batch 5775c23 Extra rules)

- "Just" used as a recency adverb in a title ("Just Shipped", "Just Got", "Just Released", "Just Published") is a relative-time word. Drop it. Non-time "just" ("Just Works", "Just Fine", "Just a Browser") stays.
- Hardware model names outside quotes take the vendor's official spacing as well as casing ("E5-2673 v3", "RX 580"). Summary quotes keep the poster's form.
- If a poster's sentence contains a slip that changes its meaning (e.g. "never been this excited ... for a while"), don't use it for the title, and don't cut it in a way that changes the meaning (to "never"). Build the title from the poster's other words.
- A date range added to a quoted work title is allowed only when it is printed on the work itself (cover or header). Use parentheses after the closing quote.
- Translations use the target-language sense, not false friends ("fechou minha migração" -> "completed", not "closed").

## Also keep (from batch 94f20a5 Extra rules)

- Keep a capability as a capability. If the poster says "you can use X", the title says "Can Use X", not "Uses X".
- When a still or end card shows a URL or repo path, quote it exactly. Don't write "a repo line" or "a link".
- When a quoted clause is immediately qualified by the next sentence (e.g. "expensive" -> "Not necessarily in money, but in time and attention."), quote the qualifier too. Ending the quote before it changes the meaning.
- A related id can rest on an exact catalog-listing or repo link in the post or the poster's follow-up even when the catalog author can't be tied to the poster. Then the summary must not state authorship beyond the poster's own quoted words.

## Also keep (from batch 310d380 Extra rules)

- "About to" and "Already" are relative time and come out of titles; "Now" and "Ready" are fine.
- Outside quotes, fix word-order slips, but never correct a misspelled product name into one the poster didn't write; drop it instead.
- Versions outside quotes take a lowercase "v".
- When the hosted image isn't the post's first, never use a wrong ordinal ("The other image", not "A second image").
- Translate labels into the standard term for their field (e.g. "Mostly clear", "Fire hotspots").

## Also keep (from batch 772d140 Extra rules)

- A parenthetical translation is the quote in English: keep the poster's voice and subjectless phrasing (no added "they"), keep their time words, keep every clause (e.g. 录制/recording, 非常/very).
- Slips in the source stay in the translation too (discktree), even when the title uses the real product name.
- A title must not present an announced-but-not-shipped feature as delivered; follow the poster's tense ("Is Becoming", "Can Learn to").
- Translate idioms by sense (开个新坑 = "Starting a new project", not "Opening a new pit").
- Don't place a phone app "on Omarchy"; name the platform the poster names.
- A video still must not be a mid-typing caption/title card; pick a frame that shows the product, and describe only what is in it.
- Leave alone when intentional: Chinese ordinals/evaluatives such as 第十九个 → "Nineteenth" and 居然 → "Surprisingly Good"; quoted slips and time words such as "This week", "tomorrow", "imitatively", "super co again", and "RS 4.5".

## Also keep (from batch 5055979 Extra rules)

- "New in X" / "New:" in a title is relative time. Use "X Adds Y".
- When the poster gives their own English version, the parenthetical translation uses their English wording verbatim; note any added clause instead of calling it "the same".
- Percentages in titles use "%" as the poster wrote it (house precedent), not "Percent".
- Summaries cite the source, not the archive: say "quotes their earlier post", never "an earlier record".
- A still for a feature post must show the feature the post announces (e.g. the MUTED state), when any frame shows it.
- Describe only what the still shows: no OS claim ("under Omarchy") when no UI is visible, and list a table's rows in their actual order.
- A quote's punctuation is verbatim: no inserted spaces ("qs.Ui ." → "qs.Ui.").
- A home-screen web app is a "Web App" in the title, not an app.

## Also keep (from batch 28fb26f Extra rules)

- A dead or misspelled repo link in the source is not named as a repo and not corrected: write "linking <product>'s GitHub repo".
- A reply in a product's thread is about that product: name it (Strata theme variants), don't generalize to Omarchy.
- A work title carrying a date: quote the title and put the printed date in parentheses after the closing quote, even in record titles ('"Today in Omarchy" (12-Oct-2026)').
- Photos of people: describe the clothing and props you can see. No "cosplay" or character names unless the poster says so.
- On-screen numbers: read them at zoom ("10X", not "1.0X"); say what a number sits beside, and don't call it a notification without a sign that it is one.
- Mention every image of a multi-image post, at least as a group ("the other two show...").

## Also keep (from batch fb2af43 Extra rules)

- "Poster's own named plugin" covers a plugin the poster calls theirs whose catalog id is printed in their own still (Station -> yakumy.station), even without a link.
- 今から見れる and similar mean "showing from now / starting soon", not "from now on"; translate time phrases by sense.
- Describe silhouettes and characters by visible features only: no "creature" or "sprites", and no frame content you can't see (no "reaching hands" in a dark frame).
- A new post from a different account about a feature already archived is a distinct record when it adds something (here, the matching bar); it is not a duplicate.

## Also keep (from batch b9acc15 Extra rules)

- A claim the poster makes about their own result ("All hardware working") is quoted in the title, not stated as fact.
- An offer ("I'd love to open a PR") is titled as an offer ("Offers to Open a PR"), never as done ("Offered as a PR").
- When a catalog refresh adds a plugin that an earlier record links exactly, backfill that record's related_plugin_ids in the next batch's fixes.
- Describe colors on the object they actually belong to (a boat's red seat, not "a red boat").

## Also keep (from batch 928bf84 Extra rules)

- A poster's time qualifier on a limitation ("nowadays, only for X") stays in the title ("for Now Only for X"); dropping it turns a temporary state into a permanent one.
- A version title keeps the product's purpose and the change separate: "<Product> vX Does Y, Now With Z", never "Adds Z for Y" when Z is not about Y.
- A named official bundled theme (Omarchy's built-in Tokyo Night, etc.) counts as an exact match for related_theme_ids when the poster names it as the subject.
- A home-screen launcher credited to one author is never matched to a same-named catalog entry by a different author (Omalauncher by simonschubert != com.mirashif.omalauncher).

## Also keep (from batch 9334643 Extra rules)

- A poster's own discovery goes in the house present tense in titles ("Finds", not "Found").

## Also keep (from batch fc3db00 Extra rules)

- Title ongoing or unshipped work as ongoing: a poster's hedged effort ("Trying to build", "I'm building") is "Is Trying to Build" / "Is Building", never finished ("Builds"); keep launch hedges ("Previews X, Aiming to Launch Within 2–3 Days"), never "Introduces" as if shipped.
- Attribute partnership claims: a third party's claim of an official partnership is titled with "Says" ("Says Omarchy Is Teaming Up With ..."), and a correction post names what it corrects.
- Never name a person or landmark from a photo alone (no "dhh" or "Rainbow Bridge" unless printed in the image); describe them.
- When the poster gives their own English, use that English verbatim in the summary (and note any added clause), rather than paraphrasing.
- When the poster's own same-thread reply completes the ask (e.g. links the PR), the title and summary state it ("Opens a PR to Upstream It").
- "Running Native Omarchy", never "Under Native Omarchy".
- A software widget or app about a peripheral (mouse wheel menu) is kind "plugin", not "hardware".

## Also keep (from batch b3542f3 Extra rules)

- A poster's question is titled as a question ("Asks Whether to"), not as a decision already made ("May Drop").
- Keep video disclaimers ("The video illustrates that idea.") and describe only what the still shows (no headset when it isn't in the frame).
- No coined verbs (e.g. "Uniforms"); frame optional features as options ("With an Option to Drop Colored Tiles and Uniform Icon Sizing").
- Keep frequency wording exact ("more than 20 times a day", not "many times a day").

## Also keep (from batch aad2c38 Extra rules)

- An event named after a theme is not the theme: "Omarchy Tokyo Night" as a meetup does not set related_theme_ids to tokyo-night.
- Attribute measured specs with "Reports" ("Reports a Median 4464 MHz"), not as the archive's own claim ("Hits").
- Quote and translate a closing foreign-language line (e.g. Japanese) in the summary.
- Keep the poster's own verb (e.g. "shipping", "Makes" not "Ships" when they said made/makes).

## Also keep (from batch 94ca5cd Extra rules)

- "incoming!" (or similar announcement-only language with no install/link) means the title says "Previews", never "Is Shipping" / "Ships".
- Credit measurements to the poster ("Reports Idle Power on Their Air Down From 9.65 W to 5.47 W"), not as the archive's own claim.
- A theme seen only as styling in a screenshot of another app does not set related_theme_ids (clear to []).
- When a post quotes another photo, name that quoted photo's subject in the title and summary.
- No character names from app art alone (describe the figure); only name a character if the poster does.

## Also keep (from batch e4176c2 Extra rules)

- Never keep a change-marking "now" in a title ("Is Now All Scenery", "Now Runs" → "Goes All Scenery", "Runs"). "Now With" in a version title is still OK.
- Describe exactly what a figure wears ("feathers in their hair"), with no headdress or headband upgrade and no ethnic labels.
- A product name may come from the slug of the poster's own link (e.g. superwhisper.com/kiln), never from linked-page text alone.

## Also keep (from batch 35f4579 Extra rules)

- A verbless title is allowed only when it reproduces the poster's own headline or a quoted line.
- Never write "Version" after a version number.
- A plugin id in the poster's own install or update command matches when the poster is a listed member of that repo.

## Also keep (from batch 50af002 Extra rules)

- Re-check every quoted figure and phrase against the source.
- Never name a rocket, vehicle model or landmark from an image alone.
- Title a contribution to an official repo by its PR state, keeping the poster's verb.
- A non-English typo stays in the quote and translation, but the title states the intended meaning.
- A same-thread reply that changes how the still reads goes in the summary.
- A post that only celebrates a release is never titled as the poster running it.
- Sharing a theme from someone else's repo is titled "Shares".

## Also keep (from batch e3b1577 Extra rules)

- Never carry a change-marking "now" into a title, even inside a quote.
- Keep the subject a non-English verb implies.
- Name the hosted image first, with its place in the post as an aside.

## Also keep (from batch 64dc9ea Extra rules)

- Never put "Under" in a title, even when the poster uses it; keep it only inside the summary quote.

## Also keep (from batch 120b7d1 Extra rules)

- Never match omacom/omarchy links to the omarchy.dock plugin.

## Also keep (from batch 3eb46bf Extra rules)

- No change-marking "Now" in a title for a first release.
- Repo owner casing doesn't matter for plugin matches.
- During backfill scans, re-read the older records' original posts on X.

## Also keep (from batch 44eae3d Extra rules)

- Read note_tweet links on long posts (links live in note_tweet entities, not only top-level entities).
- Run the summary-repo backfill scan against the whole archive, not just the new batch: any record whose summary or title names an "owner/repo" or listing id that is in the catalog, while its related ids leave it out, is a candidate; verify each original on X before backfilling.
- A theme seen only as screenshot styling gets no related_theme_ids (clear to []).
- See rules 29–31 in /workspace/omarchy-rules-consolidated.txt (note_tweet links; issue/PR and upstream-fork matching; archive-wide backfill scan).
