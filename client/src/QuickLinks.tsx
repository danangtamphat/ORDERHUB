import { useEffect, useState } from 'react';
import { MessageCircle, ShoppingBag, Store, Truck } from 'lucide-react';

const links=[
 {label:'Pancake',href:'https://pancake.vn/multi_pages',Icon:MessageCircle,kind:'pancake'},
 {label:'Viettel Post',href:'https://viettelpost.vn/quan-ly-van-don',Icon:Truck,kind:'viettel'},
 {label:'Tạo đơn tại quầy',href:'https://pos.pancake.vn/shop/5347582',Icon:Store,kind:'pos'},
];

export default function QuickLinks({onOpenWebOrders}:{onOpenWebOrders:()=>void}){const [pendingCount,setPendingCount]=useState(0);useEffect(()=>{let mounted=true;const load=async()=>{try{const response=await fetch('/api/web-orders/pending-count',{credentials:'include',cache:'no-store'});if(!response.ok)return;const data=await response.json();if(mounted)setPendingCount(Number(data.count)||0)}catch{}};void load();const timer=window.setInterval(()=>void load(),15000);return()=>{mounted=false;window.clearInterval(timer)}},[]);return <nav className="quick-app-links" aria-label="Liên kết website thường dùng"><button type="button" className="quick-app-link website-orders" onClick={onOpenWebOrders} title="Mở đơn đặt hàng từ website"><ShoppingBag size={17} strokeWidth={2.2}/><span>Đơn từ website</span>{pendingCount>0&&<span className="quick-link-count">{pendingCount}</span>}</button>{links.map(({label,href,Icon,kind})=><a key={kind} className={`quick-app-link ${kind}`} href={href} target="_blank" rel="noopener noreferrer" title={`Mở ${label} trong tab mới`}><Icon size={17} strokeWidth={2.2}/><span>{label}</span></a>)}</nav>}
