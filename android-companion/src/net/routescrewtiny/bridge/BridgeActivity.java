package net.routescrewtiny.bridge;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;

public final class BridgeActivity extends Activity {
    private TextView message;
    private Button start;
    private String routeXml;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);int pad=(int)(24*getResources().getDisplayMetrics().density);layout.setPadding(pad,pad,pad,pad);
        TextView title=new TextView(this);title.setText("RS → OsmAnd\nAndroid trial 0.1");title.setTextSize(24);layout.addView(title);
        message=new TextView(this);message.setTextSize(17);message.setPadding(0,pad,0,pad);layout.addView(message);
        start=new Button(this);start.setText("Start chosen route in OsmAnd");start.setEnabled(false);start.setOnClickListener(v->launchOsmAnd());layout.addView(start);
        Button rs=new Button(this);rs.setText("Return to Route Screwtiny");rs.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://survive-drive-valhalla.choppy777.chatgpt.site/"))));layout.addView(rs);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(layout);scroll.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});setContentView(scroll);
        Intent received=getIntent();String inline=received.getStringExtra("gpx");Uri fileUri=received.getData();
        if(inline==null && (fileUri==null || !"content".equals(fileUri.getScheme()))) { message.setText("Install OsmAnd and download your area’s map. Set its navigation profile to Driving. Then open RS on this phone, choose your King of the Hill route, and tap Navigate in OsmAnd.\n\nThis companion reads the chosen route locally. It has no internet or location permission.");return; }
        message.setText("Checking chosen route…");
        new Thread(()->{
            try {
                String xml=inline;
                if(xml==null) {
                    try(InputStream input=getContentResolver().openInputStream(fileUri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()) { if(input==null)throw new Exception();byte[] buffer=new byte[8192];int read;while((read=input.read(buffer))!=-1){if(bytes.size()+read>GpxValidator.MAX_BYTES)throw new Exception("Route file is too large.");bytes.write(buffer,0,read);}xml=bytes.toString("UTF-8"); }
                }
                GpxValidator route=GpxValidator.parse(xml);final String accepted=xml;
                runOnUiThread(()->{routeXml=accepted;message.setText(route.name+"\n"+route.points+" original path points\n\nCheck the Driving profile and the resulting path in OsmAnd before driving. Road matching or recalculation can change it. RS exclusion zones are not transferred.\n\nThe handoff has not been verified on a physical phone yet.");start.setEnabled(true);});
            } catch(Exception e) { runOnUiThread(()->message.setText("This route could not be opened. Return to RS and choose the route again. No navigation was started.")); }
        }).start();
    }
    private void launchOsmAnd() {
        ArrayList<String> packages=new ArrayList<>(),labels=new ArrayList<>();
        for(String pkg:new String[]{"net.osmand","net.osmand.plus","net.osmand.dev"}){try{getPackageManager().getPackageInfo(pkg,0);packages.add(pkg);labels.add(pkg.equals("net.osmand")?"OsmAnd":pkg.equals("net.osmand.plus")?"OsmAnd+":"OsmAnd development");}catch(Exception ignored){}}
        if(packages.isEmpty()){message.setText("OsmAnd is not installed. Install it, download your area’s map, then return here. Your route remains ready.");return;}
        if(packages.size()==1)send(packages.get(0));else new AlertDialog.Builder(this).setTitle("Choose your OsmAnd app").setItems(labels.toArray(new String[0]),(dialog,index)->send(packages.get(index))).show();
    }
    private void send(String pkg) {
        try {
            File directory=new File(getCacheDir(),"routes");if(!directory.isDirectory()&&!directory.mkdirs())throw new Exception();
            File[] previous=directory.listFiles();if(previous!=null)for(File file:previous)if(file.isFile() && System.currentTimeMillis()-file.lastModified()>7L*24*60*60*1000)file.delete();
            File route=new File(directory,UUID.randomUUID()+".gpx");try(FileOutputStream output=new FileOutputStream(route)){output.write(routeXml.getBytes(StandardCharsets.UTF_8));}
            Uri uri=Uri.parse("content://net.routescrewtiny.bridge.routes/"+route.getName());
            Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("osmand.api://navigate_gpx?uri=true&force=false&location_permission=true"));intent.setPackage(pkg);intent.setClipData(ClipData.newRawUri("Chosen RS route",uri));intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(intent);
            message.setText("Navigation requested in OsmAnd. Check its route and Driving profile. RS cannot confirm whether navigation started or monitor later detours.\n\nReturn to RS to choose and send another route whenever needed.");
        }catch(Exception e){message.setText("OsmAnd could not be opened. Your route remains here; check that OsmAnd is installed and try again.");}
    }
}
