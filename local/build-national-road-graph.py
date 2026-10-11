"""Build the complete retained U.S. source in isolation; never alter serving data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from datetime import datetime, timezone

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--stage', required=True)
parser.add_argument('--monitor-pid', type=int, help='Reconnect supervision to the same already running staged Windows builder.')
args = parser.parse_args()
runtime, source, stage = map(lambda p: Path(p).resolve(), (args.runtime, args.source, args.stage))
stage.mkdir(parents=True, exist_ok=True)
report = stage / 'build-status.json'
state = {'schema': 'rs_national_road_build_v1', 'source': str(source), 'started_at': datetime.now(timezone.utc).isoformat(), 'serving_graph_changed': False, 'provider_calls': 0}

def checkpoint(phase, **values):
    state.update(phase=phase, updated_at=datetime.now(timezone.utc).isoformat(), free_bytes=shutil.disk_usage(stage).free, **values)
    temporary = report.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2), encoding='utf-8')
    # Windows readers and antivirus scanners can briefly deny rename/delete access.
    # Retry the progress-file rename, never the routing provider or the graph build.
    for attempt in range(30):
        try:
            temporary.replace(report)
            break
        except PermissionError:
            if attempt == 29:
                raise
            time.sleep(0.1)
    print(json.dumps({'phase': phase, **values}), flush=True)

def monitor(process):
    while process.poll() is None:
        if shutil.disk_usage(stage).free < 18 * 1024**3:
            process.terminate()
            process.wait(timeout=30)
            raise RuntimeError('Staged build stopped to preserve 18 GiB free. Existing road engines and AVM caches were untouched.')
        time.sleep(15)
        try:
            checkpoint('building', builder_pid=process.pid, threads=2)
        except PermissionError as error:
            # Keep the disk-space supervisor alive even when reporting is locked.
            print('Progress report temporarily locked: ' + str(error), flush=True)
    if process.returncode:
        raise RuntimeError(f'National graph build failed with exit code {process.returncode}; inspect build.log.')
    tiles = list((stage / 'tiles').rglob('*.gph'))
    if not tiles:
        raise RuntimeError('National graph builder produced no routing tiles.')
    state.pop('error', None)
    checkpoint('built', graph_tiles=len(tiles), graph_bytes=sum(p.stat().st_size for p in tiles), config_path=str(stage / 'valhalla-national.json'), exit_code=0)


def reconnect():
    if os.name != 'nt':
        raise RuntimeError('Reconnecting an existing builder is supported only on Windows.')
    import ctypes
    from ctypes import wintypes
    saved = json.loads(report.read_text())
    if saved.get('builder_pid') != args.monitor_pid or saved.get('source') != str(source):
        raise RuntimeError('Existing builder does not match the staged build record.')
    config = json.loads((stage / 'valhalla-national.json').read_text())
    if config['mjolnir']['tile_dir'] != str(stage / 'tiles'):
        raise RuntimeError('Existing build configuration points outside its staging directory.')
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000 | 0x100000 | 0x1, False, args.monitor_pid)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        path, size = ctypes.create_unicode_buffer(32768), wintypes.DWORD(32768)
        if not kernel.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(size)):
            raise ctypes.WinError(ctypes.get_last_error())
        expected = runtime / '.venv/Lib/site-packages/valhalla/bin/valhalla_build_tiles.exe'
        if os.path.normcase(path.value) != os.path.normcase(str(expected)):
            raise RuntimeError('Refusing to supervise an unrelated process.')
        times = [wintypes.FILETIME() for _ in range(4)]
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(t) for t in times)):
            raise ctypes.WinError(ctypes.get_last_error())
        created = ((times[0].dwHighDateTime << 32) + times[0].dwLowDateTime) / 1e7 - 11644473600
        started = datetime.fromisoformat(saved['started_at']).timestamp()
        if not started <= created <= started + 120:
            raise RuntimeError('The process ID was reused after this staged build started.')
        class RunningBuilder:
            pid = args.monitor_pid
            returncode = None
            def poll(self):
                value = wintypes.DWORD()
                if not kernel.GetExitCodeProcess(handle, ctypes.byref(value)):
                    raise ctypes.WinError(ctypes.get_last_error())
                self.returncode = None if value.value == 259 else value.value
                return self.returncode
            def terminate(self):
                if not kernel.TerminateProcess(handle, 1):
                    raise ctypes.WinError(ctypes.get_last_error())
            def wait(self, timeout):
                until = time.monotonic() + timeout
                while self.poll() is None:
                    if time.monotonic() > until:
                        raise TimeoutError('Owned builder did not stop.')
                    time.sleep(0.1)
        state.update(saved)
        state.pop('error', None)
        state.pop('exit_code', None)
        checkpoint('building', supervision_reconnected=True)
        monitor(RunningBuilder())
    finally:
        kernel.CloseHandle(handle)


def main():
    if args.monitor_pid:
        return reconnect()
    graph = stage / 'tiles'
    if graph.exists():
        raise RuntimeError('Staged tiles already exist; inspect instead of overwriting or deleting them.')
    if shutil.disk_usage(stage).free < 70 * 1024**3:
        raise RuntimeError('Complete U.S. build requires at least 70 GiB free; no serving data was changed.')
    expected = Path(str(source) + '.md5').read_text().split()[0]
    checkpoint('verifying_source', source_bytes=source.stat().st_size)
    digest = hashlib.md5()
    with source.open('rb') as handle:
        for chunk in iter(lambda: handle.read(8 * 1024**2), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise RuntimeError('Retained complete U.S. source checksum does not match its publisher checksum.')
    current = json.loads((runtime / 'valhalla.json').read_text(encoding='utf-8-sig'))
    config = json.loads(json.dumps(current))
    config['mjolnir']['tile_dir'] = str(graph)
    config['mjolnir']['tile_extract'] = ''
    config['service_limits']['max_radius'] = 1600
    config['logging']['color'] = False
    config_path = stage / 'valhalla-national.json'
    config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
    env = dict(os.environ)
    env['PATH'] = str(runtime / '.venv/Lib/site-packages/pyvalhalla.libs') + os.pathsep + env['PATH']
    command = [str(runtime / '.venv/Lib/site-packages/valhalla/bin/valhalla_build_tiles.exe'), '-c', str(config_path), '-j', '2', str(source)]
    with (stage / 'build.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen(command, cwd=stage, env=env, stdout=log, stderr=subprocess.STDOUT)
        checkpoint('building', source_md5=digest.hexdigest(), builder_pid=process.pid, threads=2)
        monitor(process)

try:
    main()
except Exception as error:
    checkpoint('failed', error=str(error), exit_code=1)
    raise
