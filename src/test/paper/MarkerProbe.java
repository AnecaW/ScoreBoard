package org.wannes.integration;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scoreboard.DisplaySlot;
import io.papermc.paper.scoreboard.numbers.FixedFormat;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import java.nio.file.Files;
import java.util.*;

/** Disposable native-server verification, not included in the module JAR. */
public final class MarkerProbe extends JavaPlugin {
 public void onEnable(){getServer().getScheduler().runTaskTimer(this,()->{
  try {for(var player:getServer().getOnlinePlayers()){
   var board=player.getScoreboard();var objective=board.getObjective(DisplaySlot.SIDEBAR);if(objective==null)continue;
   var lines=new ArrayList<Map<String,Object>>();
   for(var team:board.getTeams().stream().sorted(Comparator.comparing(t->t.getName())).toList()){
    var entry=team.getEntries().iterator().next();var format=objective.getScore(entry).numberFormat();
    lines.add(Map.of("left",LegacyComponentSerializer.legacySection().serialize(team.prefix()),"right",format instanceof FixedFormat f?LegacyComponentSerializer.legacySection().serialize(f.component()):"","fixed",format instanceof FixedFormat));
   }
   getDataFolder().mkdirs();Files.writeString(getDataFolder().toPath().resolve("status.json"),new com.google.gson.Gson().toJson(lines));
  }}catch(Exception e){throw new RuntimeException(e);}
 },1,5);}
}
