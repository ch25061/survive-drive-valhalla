package net.routescrewtiny.bridge;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Only the explicitly granted route file can be read by the receiving app. */
public final class RouteProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File route(Uri uri) throws FileNotFoundException {
        String name=uri.getLastPathSegment();
        if(!"net.routescrewtiny.bridge.routes".equals(uri.getAuthority()) || uri.getPathSegments().size()!=1 || name==null || !name.matches("[a-f0-9-]{36}\\.gpx"))throw new FileNotFoundException();
        File file=new File(new File(getContext().getCacheDir(),"routes"),name);
        if(!file.isFile())throw new FileNotFoundException();
        return file;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException { if(!"r".equals(mode))throw new FileNotFoundException("Read only"); return ParcelFileDescriptor.open(route(uri),ParcelFileDescriptor.MODE_READ_ONLY); }
    @Override public String getType(Uri uri) { return "application/gpx+xml"; }
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort) {
        try { File file=route(uri); String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection; MatrixCursor cursor=new MatrixCursor(columns); Object[] row=new Object[columns.length]; for(int i=0;i<columns.length;i++)row[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?"rs-chosen-route.gpx":OpenableColumns.SIZE.equals(columns[i])?file.length():null; cursor.addRow(row);return cursor; }catch(Exception e){return null;}
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String selection,String[] args){throw new UnsupportedOperationException();}
}
