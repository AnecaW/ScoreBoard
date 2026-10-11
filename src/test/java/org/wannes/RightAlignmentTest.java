package org.wannes;
import org.junit.Test;
import static org.junit.Assert.*;
public class RightAlignmentTest {
 @Test public void unmarkedTextIsUnchanged(){assertEquals(new RightAlignment.Parts("§aOld %unknown_x%","",false),RightAlignment.split("§aOld %unknown_x%"));}
 @Test public void splitPreservesFormattingWithoutPadding(){var p=RightAlignment.split("§a§lOnline: {right}12");assertEquals("§a§lOnline: ",p.left());assertEquals("§a§l12",p.right());assertTrue(p.marked());assertFalse(p.right().contains(RightAlignment.MARKER));}
 @Test public void resolvesBothSidesAndPreservesPosition(){assertEquals("Alice: {right}42",RightAlignment.resolve("%name%: {right}%value%",s->s.replace("%name%","Alice").replace("%value%","42")));}
 @Test public void markerAtEitherBoundaryAndEmptySuffixAreSupported(){assertEquals("12",RightAlignment.split("{right}12").right());assertEquals("",RightAlignment.split("Online{right}").right());}
 @Test public void duplicateMarkersAndControlCharactersAreRejected(){assertThrows(IllegalArgumentException.class,()->RightAlignment.validateText("{right}x{right}"));assertThrows(IllegalArgumentException.class,()->RightAlignment.validateText("a\nb"));}
 @Test public void expansionOutputCannotLeakMarkers(){assertEquals("safe{right}safe",RightAlignment.resolve("left{right}right",s->"safe{right}"));assertEquals("safe",RightAlignment.resolve("plain",s->"safe{right}"));}
}
