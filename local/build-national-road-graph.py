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
args = parser.parse_args()
runtime, source, stage = map(lambda p: Path(p).resolve(), (args.runtime, args.source, args.stage))
stage.mkdir(parents=True, exist_ok=True)
report = stage / 'build-status.json'
state = {'schema': 'rs_national_road_build_v1', 'source': str(source), 'started_at': datetime.now(timezone.utc).isoformat(), 'serving_graph_changed': False, 'provider_calls': 0}

def checkpoint(phase, **values):
    state.update(phase=phase, updated_at=datetime.now(timezone.utc).isoformat(), free_bytes=shutil.disk_usage(stage).free, **values)
    temporary = report.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2), encoding='utf-8')
    temporary.replace(report)
    print(json.dumps({'phase': phase, **values}), flush=True)

def main():
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
        while process.poll() is None:
            if shutil.disk_usage(stage).free < 18 * 1024**3:
                process.terminate()
                process.wait(timeout=30)
                raise RuntimeError('Staged build stopped to preserve 18 GiB free. Existing road engines and AVM caches were untouched.')
            time.sleep(15)
            checkpoint('building', builder_pid=process.pid, threads=2)
        if process.returncode:
            raise RuntimeError(f'National graph build failed with exit code {process.returncode}; inspect build.log.')
    tiles = list(graph.rglob('*.gph'))
    if not tiles:
        raise RuntimeError('National graph builder produced no routing tiles.')
    checkpoint('built', graph_tiles=len(tiles), graph_bytes=sum(p.stat().st_size for p in tiles), config_path=str(config_path), exit_code=0)

try:
    main()
except Exception as error:
    checkpoint('failed', error=str(error), exit_code=1)
    raise
