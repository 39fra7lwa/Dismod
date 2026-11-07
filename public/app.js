const $ = id => document.getElementById(id);
let token = localStorage.getItem("dismod_token") || "";
let me = null, friends = [], activeFriend = null, socket = null, mode = "login";
const palettes = {blue:"#3688e8",purple:"#8b68df",pink:"#e66f9d",green:"#2f9b79",orange:"#e58a3d",dark:"#79aaff"};
const headers = () => ({ Authorization: "Bearer " + token });
async function api(url, options={}) {
  const res = await fetch(url, {...options, headers:{...headers(), ...(options.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function showAuth() { $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); }
function showApp() { $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); }
function setMode(next) {
  mode=next; $("loginTab").classList.toggle("active",mode==="login"); $("registerTab").classList.toggle("active",mode==="register");
  $("authSubmit").textContent=mode==="login"?"Log in":"Create account";
  $("password").autocomplete=mode==="login"?"current-password":"new-password"; $("authError").textContent="";
}
$("loginTab").onclick=()=>setMode("login"); $("registerTab").onclick=()=>setMode("register");
$("authForm").onsubmit=async e=>{
  e.preventDefault(); $("authError").textContent="";
  try {
    const data=await fetch("/api/"+mode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("username").value,password:$("password").value})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d});
    token=data.token;localStorage.setItem("dismod_token",token);await boot();
  } catch(err){$("authError").textContent=err.message;}
};
async function boot(){
  try {
    const data=await api("/api/me");me=data.user;$("currentUser").textContent="@"+me.username;
    showApp();await loadFriends();
    if(socket)socket.disconnect();
    socket=io({auth:{token}});
    socket.on("new-message", msg=>{if(activeFriend && (msg.senderId===activeFriend.id || msg.receiverId===activeFriend.id)) loadMessages(activeFriend.id);loadFriends();});
  } catch {token="";localStorage.removeItem("dismod_token");showAuth();}
}
async function loadFriends(){
  const data=await api("/api/friends");friends=data.friends;
  $("friendList").innerHTML="";
  if(!friends.length){$("friendList").innerHTML='<div class="empty-small">Add a friend to start chatting ✨</div>';return;}
  friends.forEach(f=>{
    const el=document.createElement("div");el.className="friend-item"+(activeFriend?.id===f.id?" selected":"");
    const av=document.createElement("div");av.className="avatar";av.textContent=f.username.slice(0,1).toUpperCase();
    const meta=document.createElement("div");meta.className="friend-meta";const name=document.createElement("b");name.textContent=f.username;
    const sub=document.createElement("p");sub.textContent="Open conversation";meta.append(name,sub);el.append(av,meta);
    el.onclick=()=>selectFriend(f);$("friendList").append(el);
  });
}
async function selectFriend(friend){
  activeFriend=friend;$("emptyChat").classList.add("hidden");$("activeChat").classList.remove("hidden");
  $("chatName").textContent=friend.username;$("chatAvatar").textContent=friend.username[0].toUpperCase();
  await loadFriends();await loadMessages(friend.id);
}
function renderMessage(m){
  const node=document.createElement("div");node.className="message"+(m.senderId===me.id?" mine":"");
  if(m.imagePath){const img=document.createElement("img");img.src=m.imagePath;img.alt="Shared image";img.loading="lazy";node.append(img);}
  if(m.body){const p=document.createElement("p");p.textContent=m.body;node.append(p);}
  const time=document.createElement("time");time.textContent=new Date(m.createdAt+"Z").toLocaleString([], {hour:"2-digit",minute:"2-digit"});node.append(time);
  return node;
}
async function loadMessages(friendId){
  try{const data=await api("/api/messages/"+friendId);const box=$("messages");box.innerHTML="";data.messages.forEach(m=>box.append(renderMessage(m)));box.scrollTop=box.scrollHeight;}catch(e){console.error(e);}
}
$("messageForm").onsubmit=async e=>{
  e.preventDefault();if(!activeFriend)return;
  const body=$("messageInput").value.trim(), file=$("imageInput").files[0];if(!body&&!file)return;
  const fd=new FormData();fd.append("body",body);if(file)fd.append("image",file);
  try{await api("/api/messages/"+activeFriend.id,{method:"POST",body:fd});$("messageInput").value="";$("imageInput").value="";await loadMessages(activeFriend.id);}
  catch(err){alert(err.message);}
};
$("attachBtn").onclick=()=>$("imageInput").click();
$("imageInput").onchange=()=>{if($("imageInput").files[0])$("messageInput").placeholder="Image ready — add a caption or send";};
$("addFriendOpen").onclick=()=>$("friendModal").classList.remove("hidden");
$("closeModal").onclick=()=>$("friendModal").classList.add("hidden");
$("friendModal").onclick=e=>{if(e.target===$("friendModal"))$("friendModal").classList.add("hidden");};
$("friendForm").onsubmit=async e=>{
  e.preventDefault();$("friendError").textContent="";
  try{const d=await api("/api/friends",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("friendUsername").value})});
    $("friendModal").classList.add("hidden");$("friendUsername").value="";await loadFriends();await selectFriend(d.friend);
  }catch(err){$("friendError").textContent=err.message;}
};
$("themeToggle").onclick=()=>$("themeMenu").classList.toggle("hidden");
document.querySelectorAll("[data-theme]").forEach(btn=>btn.onclick=()=>{
  const theme=btn.dataset.theme;document.documentElement.dataset.theme=theme;localStorage.setItem("dismod_theme",theme);$("themeMenu").classList.add("hidden");
});
$("logoutBtn").onclick=()=>{if(socket)socket.disconnect();token="";me=null;activeFriend=null;localStorage.removeItem("dismod_token");showAuth();};
const savedTheme=localStorage.getItem("dismod_theme");if(savedTheme)document.documentElement.dataset.theme=savedTheme;
if(token)boot();else showAuth();
