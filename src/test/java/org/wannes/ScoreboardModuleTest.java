package org.wannes;

import org.bukkit.*;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.scoreboard.*;
import org.bukkit.scheduler.BukkitTask;
import org.wannes.plugModCore.api.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import java.lang.reflect.*;
import java.nio.file.Files;
import java.util.*;
import java.util.logging.Logger;
import static org.junit.Assert.*;

/** Tests real rendering with per-player scoreboards and replaceable shared services. */
public class ScoreboardModuleTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    final List<Player> players = new ArrayList<>();
    final Map<Scoreboard,List<String>> content = new IdentityHashMap<>();
    final Map<Scoreboard,List<io.papermc.paper.scoreboard.numbers.NumberFormat>> formats = new IdentityHashMap<>();
    final Map<Player,Scoreboard> current = new IdentityHashMap<>();
    final List<Runnable> refreshes = new ArrayList<>();
    final List<boolean[]> cancellations = new ArrayList<>();
    PlaceholderService service;
    ModuleContext context;
    ScoreboardModule module;
    int value;
    static Object empty(Class<?> type) { if(type==boolean.class)return false; if(type==int.class)return 0; if(type==long.class)return 0L; return null; }
    @SuppressWarnings("unchecked") static <T> T proxy(Class<T> type, InvocationHandler handler) { return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler); }
    Scoreboard board() {
        List<String> lines = new ArrayList<>();
        List<io.papermc.paper.scoreboard.numbers.NumberFormat> numbers=new ArrayList<>();
        Map<String,Team> teams=new HashMap<>();Map<String,Score> scores=new HashMap<>();boolean[] registered={false};
        Objective objective = proxy(Objective.class,(p,m,a)->{
            if(m.getName().equals("setDisplayName")){lines.set(0,(String)a[0]);return null;}
            if(m.getName().equals("getScore"))return scores.computeIfAbsent((String)a[0],key->{int index=numbers.size();numbers.add(null);return proxy(Score.class,(q,n,b)->{if(n.getName().equals("numberFormat")&&b!=null)numbers.set(index,(io.papermc.paper.scoreboard.numbers.NumberFormat)b[0]);return empty(n.getReturnType());});});
            return empty(m.getReturnType());});
        Scoreboard board = proxy(Scoreboard.class,(p,m,a)-> {
            if(m.getName().equals("getObjective"))return registered[0]?objective:null;
            if(m.getName().equals("registerNewObjective")){registered[0]=true;lines.add((String)a[2]);return objective;}
            if(m.getName().equals("getTeam"))return teams.get(a[0]);
            if(m.getName().equals("registerNewTeam")){String name=(String)a[0];int index=lines.size();lines.add("");net.kyori.adventure.text.Component[] prefix={net.kyori.adventure.text.Component.empty()};Team team=proxy(Team.class,(q,n,b)->{
                if(n.getName().equals("prefix")){if(b==null||b.length==0)return prefix[0];prefix[0]=(net.kyori.adventure.text.Component)b[0];lines.set(index,net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection().serialize(prefix[0]));}
                if(n.getName().equals("unregister"))teams.remove(name);return empty(n.getReturnType());});teams.put(name,team);return team;}
            return empty(m.getReturnType());
        }); content.put(board,lines); formats.put(board,numbers); return board;
    }
    Player player(String name) {
        UUID id=UUID.randomUUID(); Player player=proxy(Player.class,(p,m,a)->switch(m.getName()) {
            case "getName" -> name; case "getUniqueId" -> id; case "isOnline" -> true;
            case "getScoreboard" -> current.get(p); case "setScoreboard" -> {current.put((Player)p,(Scoreboard)a[0]); yield null;}
            default -> empty(m.getReturnType());
        });current.put(player,board());players.add(player);return player;
    }
    PlaceholderService provider(String revision) { return new PlaceholderService() {
        public String parse(OfflinePlayer player,String text){return text.replace("%test_name%",player.getName()).replace("%test_value%",revision+value);}
        public String parseBrackets(OfflinePlayer player,String text){return parse(player,text);}
        public Set<String> identifiers(){return Set.of("test");}
    }; }
    @Before public void setup() throws Exception {
        var folder=temp.newFolder();
        Files.writeString(folder.toPath().resolve("scoreboard.yml"),"mode: manual\nactive-page: page-1\npages:\n  - id: page-1\n    enabled: true\n    title: '%test_name%'\n    lines: ['%test_name%', '%test_value%', '%unknown_x%']\n");
        Files.writeString(folder.toPath().resolve("config.yml"),"cloud_enabled: false\n");
        ScoreboardManager manager=proxy(ScoreboardManager.class,(p,m,a)->m.getName().equals("getNewScoreboard")?board():empty(m.getReturnType()));
        var plugins=proxy(org.bukkit.plugin.PluginManager.class,(p,m,a)->empty(m.getReturnType()));
        var console=proxy(org.bukkit.command.ConsoleCommandSender.class,(p,m,a)->empty(m.getReturnType()));
        Server server=proxy(Server.class,(p,m,a)->switch(m.getName()) {case "isPrimaryThread"->true;case "getPluginManager"->plugins;case "getConsoleSender"->console;case "getBukkitVersion", "getVersion"->"1.21.11-R0.1-SNAPSHOT";case "getOnlinePlayers"->players;case "getScoreboardManager"->manager;case "getScheduler"->proxy(org.bukkit.scheduler.BukkitScheduler.class,(x,n,b)->empty(n.getReturnType()));default->empty(m.getReturnType());});
        Field field=Bukkit.class.getDeclaredField("server");field.setAccessible(true);field.set(null,server);
        Plugin host=proxy(Plugin.class,(p,m,a)->empty(m.getReturnType()));
        context=proxy(ModuleContext.class,(p,m,a)->switch(m.getName()) {
            case "getModuleId" -> "scoreboard";case "getDataFolder" -> folder;case "getLogger" -> Logger.getLogger("scoreboard-test");case "getHostPlugin" -> host;
            case "getService" -> service;
            case "registerService" -> {service=(PlaceholderService)a[1];yield null;}
            case "manage" -> a[0];
            case "requireService" -> {if(service==null)throw new IllegalStateException("scoreboard requires placeholderapi service");yield service;}
            case "schedule" -> {boolean[] cancelled={false};cancellations.add(cancelled);if((long)a[2]>0)refreshes.add(()->{if(!cancelled[0])( (Runnable)a[0]).run();});yield proxy(BukkitTask.class,(q,n,b)->{if(n.getName().equals("cancel"))cancelled[0]=true;return empty(n.getReturnType());});}
            default -> empty(m.getReturnType());
        }); service=provider("v1:");module=new ScoreboardModule();
    }
    @Test public void rendersPerPlayerRefreshesRebindsAndRestoresOnDisable() {
        Player alice=player("Alice"),bob=player("Bob"); Scoreboard original=current.get(alice);
        module.onEnable(context);
        assertNotSame(current.get(alice),current.get(bob));
        assertEquals(List.of("Alice","Alice","v1:0","%unknown_x%"),content.get(current.get(alice)));
        assertEquals("Bob",content.get(current.get(bob)).get(0));
        Scoreboard stable=current.get(alice);value=7;refreshes.forEach(Runnable::run);assertEquals("v1:7",content.get(current.get(alice)).get(2));assertSame(stable,current.get(alice));
        service=provider("v2:");refreshes.forEach(Runnable::run);assertEquals("v2:7",content.get(current.get(alice)).get(2));
        service=null;refreshes.forEach(Runnable::run);assertEquals("%test_value%",content.get(current.get(alice)).get(2));
        service=provider("v3:");refreshes.forEach(Runnable::run);assertEquals("v3:7",content.get(current.get(alice)).get(2));
        module.onDisable();assertSame(original,current.get(alice));assertTrue(cancellations.stream().allMatch(flag->flag[0]));
        refreshes.forEach(Runnable::run);assertSame(original,current.get(alice));
    }
    @Test public void missingProviderIsAnActionableEnableFailure() {service=null;assertTrue(assertThrows(IllegalStateException.class,()->module.onEnable(context)).getMessage().contains("placeholderapi"));}
    @Test public void markersPersistAndUseNativeRightColumnAfterReopen() throws Exception {
        Player alice=player("Alice");module.onEnable(context);
        Map<String,String> request=Map.of("pageCount","1","page.0.id","page-1","page.0.title","Title","page.0.lines","§aName: {right}%test_name%\nValue: {right}%test_value%\nUnchanged","page.0.preserveBlankLines","true");
        assertEquals(200,module.handleApiRequest("POST","/scoreboard/set",request).getStatusCode());module.reloadFromConfig();
        assertEquals(List.of("Title","§aName: ","Value: ","Unchanged"),content.get(current.get(alice)));
        assertEquals("§aAlice",net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection().serialize(((io.papermc.paper.scoreboard.numbers.FixedFormat)formats.get(current.get(alice)).get(0)).component()));
        assertEquals("v1:0",((io.papermc.paper.scoreboard.numbers.FixedFormat)formats.get(current.get(alice)).get(1)).component().toString().contains("v1:0")?"v1:0":"bad");
        assertNull(formats.get(current.get(alice)).get(2));
        assertTrue(module.handleApiRequest("GET","/scoreboard/get",Map.of()).getBody().contains("{right}"));
        value=12;refreshes.forEach(Runnable::run);assertTrue(((io.papermc.paper.scoreboard.numbers.FixedFormat)formats.get(current.get(alice)).get(1)).component().toString().contains("v1:12"));
        module.onDisable();module=new ScoreboardModule();module.onEnable(context);assertEquals("§aName: ",content.get(current.get(alice)).get(1));assertTrue(formats.get(current.get(alice)).get(0) instanceof io.papermc.paper.scoreboard.numbers.FixedFormat);module.onDisable();
    }
    @Test public void invalidMarkerDoesNotOverwriteConfigAndBlankRowsSurvive() throws Exception {
        module.onEnable(context);var file=new java.io.File(context.getDataFolder(),"scoreboard.yml");String before=Files.readString(file.toPath());
        assertEquals(400,module.handleApiRequest("POST","/scoreboard/set",Map.of("pageCount","1","page.0.lines","a{right}b{right}c")).getStatusCode());assertEquals(before,Files.readString(file.toPath()));
        assertEquals(200,module.handleApiRequest("POST","/scoreboard/set",Map.of("pageCount","1","page.0.lines","\n","page.0.preserveBlankLines","true")).getStatusCode());
        var page=org.bukkit.configuration.file.YamlConfiguration.loadConfiguration(file).getMapList("pages").getFirst();assertEquals(List.of("",""),page.get("lines"));module.onDisable();
    }
    @Test public void rendersThroughTheRealPlaceholderModuleAndObservesExpansionReplacement() {
        Player alice=player("Alice");
        me.clip.placeholderapi.PlaceholderAPIPlugin.init(context);
        try {
            class Expansion extends me.clip.placeholderapi.expansion.PlaceholderExpansion {
                final String revision;Expansion(String revision){this.revision=revision;}
                public String getIdentifier(){return "test";}public String getAuthor(){return "test";}public String getVersion(){return "1";}
                public String onRequest(OfflinePlayer player,String parameters){return parameters.equals("name")?player.getName():parameters.equals("value")?revision+value:null;}
            }
            Expansion first=new Expansion("real1:");assertTrue(first.register());module.onEnable(context);
            assertEquals(List.of("Alice","Alice","real1:0","%unknown_x%"),content.get(current.get(alice)));
            assertTrue(first.unregister());Expansion second=new Expansion("real2:");assertTrue(second.register());
            value=8;refreshes.forEach(Runnable::run);assertEquals("real2:8",content.get(current.get(alice)).get(2));
            assertTrue(second.unregister());refreshes.forEach(Runnable::run);assertEquals("%test_value%",content.get(current.get(alice)).get(2));
        } finally {module.onDisable();me.clip.placeholderapi.PlaceholderAPIPlugin.shutdown();}
    }
}
