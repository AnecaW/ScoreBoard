package org.wannes;

import org.bukkit.ChatColor;
import java.util.function.UnaryOperator;

/** The right side is sent as a native Paper fixed score-number component, never padded. */
final class RightAlignment {
    static final String MARKER = "{right}";
    record Parts(String left, String right, boolean marked) {}
    static Parts split(String line) {
        int index=line.indexOf(MARKER);
        if(index<0) return new Parts(line,"",false);
        String left=line.substring(0,index);
        return new Parts(left,ChatColor.getLastColors(left)+line.substring(index+MARKER.length()).replace(MARKER,""),true);
    }
    static String resolve(String line, UnaryOperator<String> parser) {
        int index=line.indexOf(MARKER);
        if(index<0) return parser.apply(line).replace(MARKER,"");
        return parser.apply(line.substring(0,index)).replace(MARKER,"")+MARKER
                +parser.apply(line.substring(index+MARKER.length())).replace(MARKER,"");
    }
    static void validateText(String text) {
        if(text.length()>4096||text.codePoints().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Scoreboardtekst bevat controltekens of is te lang");
        int index=text.indexOf(MARKER);
        if(index>=0 && text.indexOf(MARKER,index+MARKER.length())>=0)throw new IllegalArgumentException("Gebruik maximaal één Right align marker per regel");
    }
    static String escape(String text){StringBuilder out=new StringBuilder();for(char c:text.toCharArray()){switch(c){case '"'->out.append("\\\"");case '\\'->out.append("\\\\");case '\n'->out.append("\\n");case '\r'->out.append("\\r");case '\t'->out.append("\\t");default->{if(c<32)out.append(String.format("\\u%04x",(int)c));else out.append(c);}}}return out.toString();}
}
