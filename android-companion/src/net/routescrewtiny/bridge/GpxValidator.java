package net.routescrewtiny.bridge;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

/** Accept bounded GPX tracks, never URLs or external XML resources. */
public final class GpxValidator {
    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public final String name;
    public final int points;
    private GpxValidator(String name, int points) { this.name = name; this.points = points; }
    public static GpxValidator parse(String xml) throws Exception {
        if (xml == null || xml.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES
                || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY")) throw new IllegalArgumentException("Invalid or oversized route.");
        SAXParserFactory factory = SAXParserFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        final String ns = "http://www.topografix.com/GPX/1/1";
        final int[] count = {0}, depth = {0}, trackDepth = {-1}, segmentDepth = {-1}, nameDepth = {-1};
        final StringBuilder name = new StringBuilder();
        DefaultHandler handler = new DefaultHandler() {
            @Override public InputSource resolveEntity(String publicId, String systemId) throws SAXException { throw new SAXException("External resources are forbidden."); }
            @Override public void startElement(String uri, String local, String qName, Attributes attrs) throws SAXException {
                depth[0]++;
                if (depth[0] == 1 && (!ns.equals(uri) || !"gpx".equals(local))) throw new SAXException("Not a GPX route.");
                if (!ns.equals(uri)) return;
                if ("trk".equals(local)) { if(trackDepth[0] != -1) throw new SAXException("Nested tracks are invalid."); trackDepth[0] = depth[0]; }
                if ("trkseg".equals(local) && trackDepth[0] == depth[0]-1) segmentDepth[0] = depth[0];
                if ("name".equals(local) && trackDepth[0] == depth[0]-1 && name.length() == 0) nameDepth[0] = depth[0];
                if ("trkpt".equals(local)) {
                    if (segmentDepth[0] != depth[0]-1) throw new SAXException("Track point outside a segment.");
                    try {
                        double lat = Double.parseDouble(attrs.getValue("lat")), lon = Double.parseDouble(attrs.getValue("lon"));
                        if (!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || ++count[0]>20000) throw new Exception();
                    } catch (Exception e) { throw new SAXException("Invalid route coordinates."); }
                }
            }
            @Override public void characters(char[] ch, int start, int length) { if(nameDepth[0] == depth[0] && name.length()<200) name.append(ch,start,Math.min(length,200-name.length())); }
            @Override public void endElement(String uri, String local, String qName) { if(nameDepth[0] == depth[0])nameDepth[0]=-1; if(segmentDepth[0]==depth[0])segmentDepth[0]=-1; if(trackDepth[0]==depth[0])trackDepth[0]=-1; depth[0]--; }
        };
        factory.newSAXParser().parse(new InputSource(new StringReader(xml)), handler);
        if (count[0] < 2) throw new IllegalArgumentException("The route has no complete path.");
        return new GpxValidator(name.length()==0 ? "Chosen RS route" : name.toString(),count[0]);
    }
}
