"""Build an explicitly synthetic candidate set for filming the real SD interface.

Coordinates are schematic training polylines, not Valhalla road routes. Values
are invented for instruction and must never be entered into the shared cache.
"""
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parent
paths=[
  ('West corridor',[(-118.5426,34.3917),(-118.55,34.26),(-118.46,34.12),(-118.40,34.01),(-118.29,33.88),(-118.1937,33.7701)],52,85,[180,430,450,465,490,None,470,480,510,525,535,550]),
  ('Central corridor',[(-118.5426,34.3917),(-118.43,34.30),(-118.31,34.19),(-118.27,34.04),(-118.23,33.89),(-118.1937,33.7701)],48,79,[190,175,410,420,430,445,460,470,None,None,None,None]),
  ('Coast approach',[(-118.5426,34.3917),(-118.50,34.20),(-118.49,34.06),(-118.44,33.95),(-118.35,33.82),(-118.1937,33.7701)],60,93,[190,370,None,None,None,None,None,None,None,None,None,None]),
  ('East corridor',[(-118.5426,34.3917),(-118.35,34.28),(-118.18,34.16),(-118.16,34.02),(-118.18,33.88),(-118.1937,33.7701)],57,88,[180,170,160,390,410,430,450,470,480,490,None,None]),
]

def point(nodes,t):
    x=t*(len(nodes)-1);i=min(len(nodes)-2,int(x));f=x-i
    return [(1-f)*nodes[i][j]+f*nodes[i+1][j] for j in (0,1)]

def hexagon(lon,lat):
    return [[lon+.008*math.cos(k*math.pi/3),lat+.006*math.sin(k*math.pi/3)] for k in range(6)]

routes=[]
for i,(name,nodes,miles,minutes,values) in enumerate(paths,1):
    geometry=[point(nodes,k/59) for k in range(60)]
    cells=[]
    for j,value in enumerate(values):
        lon,lat=point(nodes,(j+.5)/len(values))
        cells.append(dict(cell_id=f'ILLUSTRATIVE-LA-{i:02}-{j+1:02}',polygon=hexagon(lon,lat),outside_here_distance_m=1609.344,value_origin='illustrative_training_value',estimate_ppsqft=value,latitude=lat,longitude=lon,source_artifact='synthetic tutorial; not provider evidence' if value is not None else None))
    routes.append(dict(id=f'la-demo-{i}',name=name,route_number=1,geometry=geometry,cells=cells,length_m=miles*1609.344,duration_s=minutes*60,authority_only_cell_count=0))

subject=dict(bathrooms='2',bedrooms='3',lookupSubjectAttributes=False,propertyType='Single Family',squareFootage='1500')
payload=dict(schema='survive_drive_session_v1',description='Synthetic training trip. Polylines are not Valhalla road routes. AVM numbers are invented. No provider calls.',trip_setup=dict(origin='34.3917,-118.5426',destination='33.7701,-118.1937',origin_name='Santa Clarita, CA',destination_name='Long Beach, CA',routing_mode='fast',candidate_limit=4,departure_mode='any'),candidates=dict(schema='survive_drive_candidate_set_v1',subject_profile=subject,routes=routes),settings=dict(red_threshold_ppsqft=200,color_upper_ppsqft=500,color_upper_customized=True),map_cell_evidence=[])
(ROOT/'la-demo-synthetic.json').write_text(json.dumps(payload,separators=(',',':'))+'\n',encoding='utf8')
print('Synthetic LA demo saved; no provider calls.')
