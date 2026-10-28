export const backgroundVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

export const backgroundFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uPointer;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  float fbm(vec2 p) { float f=0.0; float a=0.5; for(int i=0;i<4;i++){f+=noise(p)*a;p=p*2.02+vec2(7.1,4.7);a*=0.5;} return f; }
  void main() {
    vec2 uv=vUv;
    float connection=smoothstep(.3,.48,uProgress)*(1.0-smoothstep(.56,.7,uProgress));
    float clarity=smoothstep(.6,.76,uProgress)*(1.0-smoothstep(.85,1.0,uProgress));
    vec2 drift=vec2(uTime*.013,-uTime*.008)+uPointer*.035;
    float cloud=fbm(uv*3.8+drift);
    vec3 dark=mix(vec3(.018,.046,.066),vec3(.01,.025,.045),connection);
    vec3 light=mix(vec3(.11,.25,.31),vec3(.2,.34,.34),clarity);
    light*=1.0-connection*.65;
    float glow=exp(-length((uv-vec2(.7,.55)) * vec2(1.4,1.15))*2.5);
    float horizon=exp(-abs(uv.y-.38+cloud*.08)*13.0)*.16;
    vec3 col=mix(dark,light,glow*(.45+cloud*.45));
    col+=vec3(.09,.18,.18)*horizon;
    col+=vec3(.16,.14,.09)*clarity*pow(max(0.0,1.0-length(uv-vec2(.78,.4))),6.0)*.35;
    col*=1.0-.28*pow(length(uv-.5),1.5);
    gl_FragColor=vec4(col,1.0);
    #include <colorspace_fragment>
  }
`;

export const particleVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aKind;
  attribute float aSize;
  uniform float uTime;
  uniform float uProgress;
  uniform float uTunnel;
  uniform float uEvidence;
  uniform float uSelected;
  uniform float uPixelRatio;
  uniform float uPulse;
  uniform vec3 uCore;
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    float t=fract(aSeed+uTime*(.045+aSize*.012));
    float angle=aSeed*147.0+uTime*.08;
    vec3 orbit=position;
    orbit.x+=sin(uTime*.1+aSeed*20.0)*.2;
    orbit.y+=cos(uTime*.12+aSeed*16.0)*.2;
    float weave=smoothstep(.12,.35,uProgress);
    vec3 end=uCore;
    vec3 stream=mix(orbit,end,t);
    stream+=vec3(cos(angle),sin(angle),sin(angle*.7))*sin(t*3.14159265)*.75;
    float radius=1.6+aSize*1.8;
    vec3 tunnel=vec3(cos(angle)*radius,sin(angle)*radius,mix(7.0,-19.0,t));
    vec3 p=mix(orbit,stream,weave*.85);
    p=mix(p,tunnel,uTunnel);
    p+=normalize(p-uCore+vec3(.001))*uPulse*.28*sin(t*3.14159265);
    vec4 view=modelViewMatrix*vec4(p,1.0);
    gl_Position=projectionMatrix*view;
    gl_PointSize=clamp((1.5+aSize*2.0)*(1.0+uTunnel*.8)*uPixelRatio*9.0/max(2.0,-view.z),1.0,8.0*uPixelRatio);
    float selected=1.0-step(.25,abs(aKind-uSelected));
    vColor=mix(vec3(.28,.58,.66),vec3(.75,.9,.85),aSize);
    vColor=mix(vColor,vec3(.9,.73,.47),step(1.5,aKind)*.65);
    vAlpha=(.25+selected*.35)*(1.0-smoothstep(20.0,45.0,-view.z));
    vAlpha*=mix(1.0,sin(t*3.14159265),weave*.6);
    vAlpha*=1.0+uTunnel*1.8;
  }
`;

export const particleFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    float d=length(gl_PointCoord-.5)*2.0;
    if(d>1.0) discard;
    float alpha=pow(1.0-d,2.3)*vAlpha;
    gl_FragColor=vec4(vColor,alpha);
    #include <colorspace_fragment>
  }
`;

export const floorVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;

export const floorFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;
  void main(){
    vec2 p=(vUv-.5)*40.0;
    float radius=length(p);
    float line=1.0-smoothstep(.0,.025,abs(fract(radius*.7)-.5));
    float angle=atan(p.y,p.x);
    float stitches=step(.45,fract(angle*26.0+radius*.3));
    float falloff=exp(-radius*.17)*smoothstep(.3,2.0,radius);
    float alpha=line*stitches*falloff*.22;
    gl_FragColor=vec4(.28,.52,.59,alpha);
    #include <colorspace_fragment>
  }
`;

export const linkVertex = /* glsl */ `
  attribute float aDistance;
  uniform float uTime;
  varying float vDistance;
  void main(){ vDistance=aDistance; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;

export const linkFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vDistance;
  void main(){
    float dash=smoothstep(.45,.65,sin(vDistance*55.0-uTime*2.8)*.5+.5);
    float pulse=pow(max(0.0,sin(vDistance*5.0-uTime*.9)),12.0);
    gl_FragColor=vec4(uColor,(.22+dash*.32+pulse*.45)*uOpacity);
    #include <colorspace_fragment>
  }
`;
