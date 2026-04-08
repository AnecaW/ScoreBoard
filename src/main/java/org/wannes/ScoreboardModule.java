package org.wannes;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.scoreboard.*;
import org.bukkit.configuration.file.YamlConfiguration;

import org.wannes.plugModCore.api.Module;
import org.wannes.plugModCore.api.ModuleContext;
import org.wannes.plugModCore.api.ModuleWebApi;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class ScoreboardModule implements Module, ModuleWebApi {

    private static class ScoreboardPage {
        String id;
        String name;
        boolean enabled;
        String title;
        List<String> lines;
    }

    private Scoreboard scoreboard;
    private ModuleContext context;
    private File configFile;
    private String lastAppliedTitle;
    private List<String> lastAppliedLines = new ArrayList<>();
    private final List<ScoreboardPage> pages = new ArrayList<>();
    private String mode = "manual";
    private int rotationSeconds = 10;
    private String activePageId = "page-1";
    private int activePageIndex = 0;
    private int rotationTaskId = -1;
    private int liveReloadDebounceTaskId = -1;
    private final Listener playerJoinListener = new Listener() {
        @EventHandler
        public void onPlayerJoin(PlayerJoinEvent event) {
            if (scoreboard == null) return;
            // Next tick to avoid race with join initialization and other plugins.
            Bukkit.getScheduler().runTaskLater(getHostPlugin(), () -> {
                if (scoreboard != null && event.getPlayer().isOnline()) {
                    event.getPlayer().setScoreboard(scoreboard);
                }
            }, 1L);
        }
    };
    private Plugin hostPlugin;
    private boolean listenerRegistered;

    @Override
    public void onEnable(ModuleContext context) {
        this.context = context;

        // 1. Zorg dat default files bestaan
        ensureDefaults(context);

        // 2. Config laden
        configFile = new File(context.getDataFolder(), "scoreboard.yml");
        reloadFromConfig();

        hostPlugin = Bukkit.getPluginManager().getPlugin("PlugModCore");
        if (hostPlugin != null && !listenerRegistered) {
            Bukkit.getPluginManager().registerEvents(playerJoinListener, hostPlugin);
            listenerRegistered = true;
        }

        context.getLogger().info("Scoreboard module enabled");
    }

    @Override
    public void onDisable() {
        if (scoreboard == null) return;

        Scoreboard main = Bukkit.getScoreboardManager().getMainScoreboard();
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(main);
        }

        scoreboard = null;
        stopLiveReloadDebounceTask();
        stopRotationTask();
        if (listenerRegistered) {
            HandlerList.unregisterAll(playerJoinListener);
            listenerRegistered = false;
        }
        context.getLogger().info("Scoreboard module disabled");
    }

    @Override
    public ApiResponse handleApiRequest(String method, String path, Map<String, String> params) {
        if (path == null) return ApiResponse.notFound("Endpoint niet gevonden");

        if ("GET".equalsIgnoreCase(method) && "/scoreboard/get".equals(path)) {
            return getScoreboardApi();
        }

        if ("POST".equalsIgnoreCase(method) && "/scoreboard/set".equals(path)) {
            return setScoreboardApi(params);
        }

        return ApiResponse.notFound("Endpoint niet gevonden");
    }

    /* =========================
       HELPERS
       ========================= */

    private void ensureDefaults(ModuleContext context) {
        copyResource(context, "scoreboard.yml", false);
        copyResource(context, "web/index.html", true);
        copyResource(context, "web/scoreboard.css", true);
        copyResource(context, "web/scoreboard.js", true);
    }

    private void copyResource(ModuleContext context, String path, boolean overwrite) {
        File out = new File(context.getDataFolder(), path);
        if (out.exists() && !overwrite) return;

        File parent = out.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        try (InputStream in = getClass().getResourceAsStream("/" + path)) {
            if (in == null) {
                context.getLogger().warning("Resource ontbreekt in JAR: " + path);
                return;
            }
            Files.copy(in, out.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            context.getLogger().severe("Kon resource niet kopiëren: " + path);
            e.printStackTrace();
        }
    }

    private String color(String s) {
        if (s == null) return "";

        // Support both explicit section sign and ampersand formatting for robustness.
        // This keeps magic formatting (§k / &k) working as obfuscated in-game text.
        String normalized = s.replace("\\u00A7", "§");
        normalized = ChatColor.translateAlternateColorCodes('&', normalized);
        return normalized;
    }

    public void reloadFromConfig() {
        if (context == null) return;

        try {
            File f = configFile != null ? configFile : new File(context.getDataFolder(), "scoreboard.yml");
            YamlConfiguration cfg = YamlConfiguration.loadConfiguration(f);
            loadConfigState(cfg);
            applyActivePage();
            configureRotation();
            context.getLogger().info("Scoreboard config opnieuw geladen via web editor");
        } catch (Exception e) {
            context.getLogger().severe("Kon scoreboard niet herladen: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void loadConfigState(YamlConfiguration cfg) {
        pages.clear();

        mode = cfg.getString("mode", "manual");
        rotationSeconds = Math.max(1, cfg.getInt("rotation-seconds", 10));
        activePageId = cfg.getString("active-page", "page-1");

        List<Map<?, ?>> mapList = cfg.getMapList("pages");
        if (mapList != null && !mapList.isEmpty()) {
            for (int i = 0; i < mapList.size(); i++) {
                Map<?, ?> map = mapList.get(i);
                ScoreboardPage page = new ScoreboardPage();
                Object idObj = map.get("id");
                Object nameObj = map.get("name");
                Object enabledObj = map.get("enabled");
                Object titleObj = map.get("title");

                page.id = idObj != null ? String.valueOf(idObj) : "page-" + (i + 1);
                page.name = nameObj != null ? String.valueOf(nameObj) : "Pagina " + (i + 1);
                page.enabled = enabledObj == null || Boolean.parseBoolean(String.valueOf(enabledObj));
                page.title = titleObj != null ? String.valueOf(titleObj) : "§aScoreboard";

                page.lines = new ArrayList<>();
                Object rawLines = map.get("lines");
                if (rawLines instanceof List<?> linesObj) {
                    for (Object line : linesObj) {
                        page.lines.add(String.valueOf(line));
                    }
                }

                pages.add(page);
            }
        }

        // Backward compatibility for old single-page configs.
        if (pages.isEmpty()) {
            ScoreboardPage page = new ScoreboardPage();
            page.id = "page-1";
            page.name = "Pagina 1";
            page.enabled = true;
            page.title = cfg.getString("title", "§aScoreboard");
            page.lines = cfg.getStringList("lines");
            pages.add(page);
            activePageId = page.id;
        }

        int resolvedIndex = findPageIndexById(activePageId);
        if (resolvedIndex < 0) {
            resolvedIndex = firstEnabledPageIndex();
        }
        if (resolvedIndex < 0) {
            resolvedIndex = 0;
        }
        activePageIndex = resolvedIndex;
    }

    private void configureRotation() {
        stopRotationTask();

        if (!"auto".equalsIgnoreCase(mode)) {
            return;
        }

        if (countEnabledPages() <= 1) {
            return;
        }

        Plugin plugin = getHostPlugin();
        if (plugin == null) {
            return;
        }

        long period = Math.max(1, rotationSeconds) * 20L;
        rotationTaskId = Bukkit.getScheduler().scheduleSyncRepeatingTask(plugin, () -> {
            int next = nextEnabledPageIndex(activePageIndex);
            if (next >= 0 && next != activePageIndex) {
                activePageIndex = next;
                activePageId = pages.get(activePageIndex).id;
                applyActivePage();
            }
        }, period, period);
    }

    private void scheduleLiveReloadDebounced() {
        Plugin plugin = getHostPlugin();
        if (plugin == null) return;

        stopLiveReloadDebounceTask();
        liveReloadDebounceTaskId = Bukkit.getScheduler().scheduleSyncDelayedTask(plugin, this::reloadFromConfig, 3L);
    }

    private void stopLiveReloadDebounceTask() {
        if (liveReloadDebounceTaskId != -1) {
            Bukkit.getScheduler().cancelTask(liveReloadDebounceTaskId);
            liveReloadDebounceTaskId = -1;
        }
    }

    private void stopRotationTask() {
        if (rotationTaskId != -1) {
            Bukkit.getScheduler().cancelTask(rotationTaskId);
            rotationTaskId = -1;
        }
    }

    private void applyActivePage() {
        if (pages.isEmpty()) return;
        if (activePageIndex < 0 || activePageIndex >= pages.size()) activePageIndex = 0;

        ScoreboardPage page = pages.get(activePageIndex);
        if (!page.enabled) {
            int firstEnabled = firstEnabledPageIndex();
            if (firstEnabled >= 0) {
                activePageIndex = firstEnabled;
                page = pages.get(activePageIndex);
            }
        }

        String title = color(page.title);
        List<String> normalizedLines = new ArrayList<>();
        for (String line : page.lines) {
            normalizedLines.add(color(line));
        }

        if (Objects.equals(lastAppliedTitle, title) && lastAppliedLines.equals(normalizedLines)) {
            return;
        }

        ScoreboardManager manager = Bukkit.getScoreboardManager();
        if (manager == null) {
            context.getLogger().warning("ScoreboardManager is null");
            return;
        }

        scoreboard = manager.getNewScoreboard();

        Objective obj = scoreboard.registerNewObjective(
                "pmc_scoreboard",
                "dummy",
                title
        );
        obj.setDisplaySlot(DisplaySlot.SIDEBAR);

        int score = 15;
        for (int i = 0; i < normalizedLines.size(); i++) {
            String line = normalizedLines.get(i);
            if (score <= 0) break;

            // Use Teams for line rendering so duplicate or heavily formatted lines
            // still display correctly (plugin-like behavior for multi-page boards).
            // Use only one color code as entry key; avoid adding RESET which can show artifacts on some clients.
            String entryKey = ChatColor.values()[i % ChatColor.values().length].toString();
            Team lineTeam = scoreboard.getTeam("line_" + i);
            if (lineTeam == null) {
                lineTeam = scoreboard.registerNewTeam("line_" + i);
            }
            lineTeam.addEntry(entryKey);

            String[] parts = splitForTeam(line);
            lineTeam.setPrefix(parts[0]);
            lineTeam.setSuffix(parts[1]);

            obj.getScore(entryKey).setScore(score--);
        }

        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(scoreboard);
        }

        lastAppliedTitle = title;
        lastAppliedLines = normalizedLines;
    }

    private int findPageIndexById(String pageId) {
        for (int i = 0; i < pages.size(); i++) {
            if (Objects.equals(pages.get(i).id, pageId)) return i;
        }
        return -1;
    }

    private int firstEnabledPageIndex() {
        for (int i = 0; i < pages.size(); i++) {
            if (pages.get(i).enabled) return i;
        }
        return -1;
    }

    private int countEnabledPages() {
        int count = 0;
        for (ScoreboardPage page : pages) {
            if (page.enabled) count++;
        }
        return count;
    }

    private int nextEnabledPageIndex(int from) {
        if (pages.isEmpty()) return -1;
        for (int step = 1; step <= pages.size(); step++) {
            int idx = (from + step) % pages.size();
            if (pages.get(idx).enabled) return idx;
        }
        return -1;
    }

    private String[] splitForTeam(String text) {
        String safe = text == null ? "" : text;

        // Keep safe for modern Paper while not overflowing team components.
        int maxPrefix = 64;
        int maxSuffix = 64;

        // Avoid splitting in the middle of a formatting code (section sign + code).
        int split = Math.min(safe.length(), maxPrefix);
        if (split > 0 && split < safe.length() && safe.charAt(split - 1) == '§') {
            split--;
        }

        String prefix = safe.substring(0, split);
        String suffix = "";

        if (safe.length() > split) {
            String tail = safe.substring(split);

            // Continue formatting from prefix in suffix, otherwise effects like underline/strike can get lost.
            String carry = ChatColor.getLastColors(prefix);
            suffix = carry + tail;

            if (suffix.length() > maxSuffix) {
                int end = maxSuffix;
                if (end > 0 && end < suffix.length() && suffix.charAt(end - 1) == '§') {
                    end--;
                }
                suffix = suffix.substring(0, end);
            }
        }

        return new String[]{prefix, suffix};
    }

    private ApiResponse getScoreboardApi() {
        try {
            File f = configFile != null ? configFile : new File(context.getDataFolder(), "scoreboard.yml");
            YamlConfiguration cfg = YamlConfiguration.loadConfiguration(f);

            String mode = cfg.getString("mode", "manual");
            int rotationSeconds = cfg.getInt("rotation-seconds", 10);
            String activePageId = cfg.getString("active-page", "page-1");

            List<Map<?, ?>> pageMaps = cfg.getMapList("pages");
            if (pageMaps == null || pageMaps.isEmpty()) {
                Map<String, Object> single = new java.util.HashMap<>();
                single.put("id", "page-1");
                single.put("name", "Pagina 1");
                single.put("enabled", true);
                single.put("title", cfg.getString("title", "§aServerManager"));
                single.put("lines", cfg.getStringList("lines"));
                pageMaps = new ArrayList<>();
                pageMaps.add(single);
                activePageId = "page-1";
            }

            StringBuilder sb = new StringBuilder();
            sb.append("{\"mode\":\"").append(jsonEscape(mode)).append("\"");
            sb.append(",\"rotationSeconds\":").append(rotationSeconds);
            sb.append(",\"activePageId\":\"").append(jsonEscape(activePageId)).append("\"");
            sb.append(",\"pages\":[");

            for (int i = 0; i < pageMaps.size(); i++) {
                if (i > 0) sb.append(",");
                Map<?, ?> p = pageMaps.get(i);

                Object pageIdObj = p.get("id");
                Object pageNameObj = p.get("name");
                Object pageEnabledObj = p.get("enabled");
                Object pageTitleObj = p.get("title");

                String pageId = pageIdObj != null ? String.valueOf(pageIdObj) : "page-" + (i + 1);
                String pageName = pageNameObj != null ? String.valueOf(pageNameObj) : "Pagina " + (i + 1);
                boolean pageEnabled = pageEnabledObj == null || Boolean.parseBoolean(String.valueOf(pageEnabledObj));
                String pageTitle = pageTitleObj != null ? String.valueOf(pageTitleObj) : "§aServerManager";

                List<String> pageLines = new ArrayList<>();
                Object rawLines = p.get("lines");
                if (rawLines instanceof List<?> listObj) {
                    for (Object lineObj : listObj) {
                        pageLines.add(String.valueOf(lineObj));
                    }
                }

                sb.append("{\"id\":\"").append(jsonEscape(pageId)).append("\"");
                sb.append(",\"name\":\"").append(jsonEscape(pageName)).append("\"");
                sb.append(",\"enabled\":").append(pageEnabled);
                sb.append(",\"title\":\"").append(jsonEscape(pageTitle)).append("\"");
                sb.append(",\"lines\":[");
                for (int l = 0; l < pageLines.size(); l++) {
                    if (l > 0) sb.append(",");
                    sb.append("\"").append(jsonEscape(pageLines.get(l))).append("\"");
                }
                sb.append("]}");
            }

            sb.append("]}");
            return ApiResponse.okJson(sb.toString());
        } catch (Exception e) {
            return ApiResponse.error("Kon scoreboard config niet lezen: " + e.getMessage());
        }
    }

    private ApiResponse setScoreboardApi(Map<String, String> params) {
        try {
            String modeParam = params.getOrDefault("mode", "manual");
            int rotationSecondsParam = Math.max(1, parseIntSafe(params.get("rotationSeconds"), 10));
            String activePageIdParam = params.getOrDefault("activePageId", "");
            int pageCount = Math.max(0, parseIntSafe(params.get("pageCount"), 0));

            List<Map<String, Object>> pagesOut = new ArrayList<>();
            for (int i = 0; i < pageCount; i++) {
                String prefix = "page." + i + ".";
                String pageId = params.getOrDefault(prefix + "id", "page-" + (i + 1));
                String pageName = params.getOrDefault(prefix + "name", "Pagina " + (i + 1));
                boolean pageEnabled = Boolean.parseBoolean(params.getOrDefault(prefix + "enabled", "true"));
                String pageTitle = params.getOrDefault(prefix + "title", "§aServerManager");
                String pageLinesText = params.getOrDefault(prefix + "lines", "");

                List<String> pageLines = new ArrayList<>();
                if (!pageLinesText.isBlank()) {
                    try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.StringReader(pageLinesText))) {
                        String line;
                        while ((line = br.readLine()) != null) {
                            pageLines.add(line);
                        }
                    }
                }

                Map<String, Object> page = new java.util.HashMap<>();
                page.put("id", pageId);
                page.put("name", pageName);
                page.put("enabled", pageEnabled);
                page.put("title", pageTitle);
                page.put("lines", pageLines);
                pagesOut.add(page);
            }

            if (pagesOut.isEmpty()) {
                String title = params.getOrDefault("title", "§aServerManager");
                String linesText = params.getOrDefault("lines", "");

                List<String> lines = new ArrayList<>();
                if (!linesText.isBlank()) {
                    try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.StringReader(linesText))) {
                        String line;
                        while ((line = br.readLine()) != null) {
                            lines.add(line);
                        }
                    }
                }

                Map<String, Object> single = new java.util.HashMap<>();
                single.put("id", "page-1");
                single.put("name", "Pagina 1");
                single.put("enabled", true);
                single.put("title", title);
                single.put("lines", lines);
                pagesOut.add(single);
            }

            if (activePageIdParam.isBlank()) {
                activePageIdParam = String.valueOf(pagesOut.get(0).get("id"));
            }
            final String activePageIdFinal = activePageIdParam;

            File f = configFile != null ? configFile : new File(context.getDataFolder(), "scoreboard.yml");
            YamlConfiguration cfg = new YamlConfiguration();
            cfg.set("mode", modeParam);
            cfg.set("rotation-seconds", rotationSecondsParam);
                cfg.set("active-page", activePageIdFinal);
            cfg.set("pages", pagesOut);

            Map<String, Object> activePage = pagesOut.stream()
                    .filter(pg -> activePageIdFinal.equals(String.valueOf(pg.get("id"))))
                    .findFirst()
                    .orElse(pagesOut.get(0));
            cfg.set("title", activePage.get("title"));
            cfg.set("lines", activePage.get("lines"));
            cfg.save(f);

            scheduleLiveReloadDebounced();
            return ApiResponse.okJson("{\"status\":\"ok\"}");
        } catch (Exception e) {
            return ApiResponse.badRequest("Opslaan mislukt: " + e.getMessage());
        }
    }

    private int parseIntSafe(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String jsonEscape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private Plugin getHostPlugin() {
        if (hostPlugin != null) return hostPlugin;
        hostPlugin = Bukkit.getPluginManager().getPlugin("PlugModCore");
        return hostPlugin;
    }
}
