# ScoreBoard right-alignment marker

Each existing line toolbar has one **Right align** button. Place the cursor in the line and click it to insert a noneditable `⇥` token. With selected text, insertion is at the selection's start and keeps every selected character. Backspace/Delete can remove the token. There is at most one token per line, with independent tokens on other lines.

The existing string configuration stores the token as `{right}`, for example `§aOnline: {right}§l%server_online%`. No new layout schema or width setting is required. Reopening the editor reconstructs the token at its stored position. Existing lines are unchanged. The recently introduced `line-layouts` and `width-pixels` fields are ignored and omitted on the next successful save; their original text remains intact.

On Java 21 / Paper 1.21.11 the renderer puts the prefix in the normal team component and the suffix in the score's public `NumberFormat.fixed` component. Minecraft renders that component in the native right-hand score column. No font estimates, space padding, fragment alignment, custom fonts or packets are involved. The client determines the overall sidebar width and gap between its columns. Unmarked rows retain their pre-existing score-number behavior.

The marker is interpreted before sending components. Both sides use the existing shared PlaceholderService with player context on every refresh; active legacy colors and effects carry into the right component. Unknown placeholders remain visible. Saves validate duplicate markers and preserve the existing atomic configuration replacement and blank-line support.

Verification commands:

    mvn -f Modules/ScoreBoard/pom.xml clean verify
    node --test Modules/ScoreBoard/src/test/js/*.test.cjs
    python Modules/ScoreBoard/src/test/paper/run-marker-integration.py --accept-eula --paper <official-paper.jar> --protocol-client <minecraft-protocol-package>

The opt-in Paper test uses isolated temporary files and requires an authorized EULA agreement. Its probe inspects native team and fixed score components, edits, reload and full restart persistence. Browser testing covers actual cursor/selection insertion and editing on both sides. A real Minecraft client's visual appearance is not captured by the protocol test.

Latest verification (10 October 2026): module-only `clean verify` succeeded with 11 Java tests, all 6 JavaScript tests passed, and all 8 isolated live Paper checks passed, including full restart/rejoin. Browser checks verified mid-line cursor insertion, selection preservation, independent markers, editing on both sides, formatting and marker deletion. Logs: `marker-build.log`, `marker-js.log`, `marker-paper.log`; native results: `target/marker-paper-results.json`. Only files within `Modules/ScoreBoard` were changed. Test servers have been stopped; no production deployment was performed.
