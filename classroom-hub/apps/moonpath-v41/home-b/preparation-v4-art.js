// Approved originals, display-only crop/slicing. No storage or engine access.
let images;
function loadImages(){return images??=Promise.all(['frame','crest','corner','close'].map(async key=>{const img=new Image();img.src=new URL('../assets/home/preparation-v4/'+key+'-original.png',import.meta.url);await img.decode();return [key,img];}));}
export async function paintPreparation(canvas){
 const loaded=Object.fromEntries(await loadImages()),ctx=canvas.getContext('2d');canvas.width=1640;canvas.height=1000;ctx.scale(2,2);
function nine(img,s,d,b,db){const [sx,sy,sw,sh]=s,[dx,dy,dw,dh]=d,[l,t,r,bt]=b,[dl,dt,dr,dbt]=db;const xs=[sx,sx+l,sx+sw-r,sx+sw],ys=[sy,sy+t,sy+sh-bt,sy+sh],xd=[dx,dx+dl,dx+dw-dr,dx+dw],yd=[dy,dy+dt,dy+dh-dbt,dy+dh];for(let y=0;y<3;y++)for(let x=0;x<3;x++){const w=xs[x+1]-xs[x],h=ys[y+1]-ys[y];if(w>0&&h>0)ctx.drawImage(img,xs[x],ys[y],w,h,xd[x],yd[y],xd[x+1]-xd[x],yd[y+1]-yd[y]);}}
function fit(img,s,box){let [x,y,w,h]=box;const z=Math.min(w/s[2],h/s[3]);const dw=s[2]*z,dh=s[3]*z;ctx.drawImage(img,...s,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
function draw(){ctx.clearRect(0,0,820,500);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';nine(loaded.frame,[29,96,1549,836],[8,16,804,484],[56,156,56,64],[28,92,28,20]);fit(loaded.crest,[224,155,1641,452],[350,0,120,32]);fit(loaded.corner,[56,214,908,1043],[0,88,44,72]);ctx.drawImage(loaded.close,150,150,950,950,738,43,44,44);}
draw();
}
