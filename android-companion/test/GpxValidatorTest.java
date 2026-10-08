package net.routescrewtiny.bridge;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
public final class GpxValidatorTest {
    public static void main(String[] args) throws Exception {
        String xml=new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8);
        GpxValidator route=GpxValidator.parse(xml);if(route.points!=3501 || !route.name.contains("A & <route>"))throw new AssertionError("Original route/name lost");
        String valid="<gpx xmlns=\"http://www.topografix.com/GPX/1/1\"><trk><trkseg><trkpt lat=\"0\" lon=\"0\"/><trkpt lat=\"1\" lon=\"1\"/></trkseg></trk></gpx>";
        if(GpxValidator.parse(valid).points!=2)throw new AssertionError("Zero coordinates");
        for(String bad:new String[]{valid.replace("lat=\"1\"","lat=\"91\""),valid.replace("lat=\"1\"","lat=\"NaN\""),valid.replace("<trkpt lat=\"1\" lon=\"1\"/>",""),"<!DOCTYPE gpx [<!ENTITY x SYSTEM 'https://example.com/'>]>"+valid,valid.replace("<gpx","<other").replace("</gpx>","</other>"),valid+"garbage",new String(new char[GpxValidator.MAX_BYTES+1])}) {
            boolean rejected=false;try{GpxValidator.parse(bad);}catch(Exception e){rejected=true;}if(!rejected)throw new AssertionError("Invalid input accepted");
        }
        System.out.println("Passed native GPX validator: 3501 original points and escaped name; bounds, invalid XML, external entities and size rejected.");
    }
}
