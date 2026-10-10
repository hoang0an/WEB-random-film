import type {Entry, Group} from './domain';
export const isGroupMember=(g:Group,uid:string)=>g.members.some(m=>m.id===uid);
export const isGroupOwner=(g:Group,uid:string)=>isGroupMember(g,uid)&&g.ownerId===uid;
export const canDeleteMovie=(g:Group,e:Entry,uid:string)=>isGroupMember(g,uid)&&!e.watchedAt&&(e.addedBy===uid||isGroupOwner(g,uid));
export const canEditOwn=(g:Group,author:string,uid:string)=>isGroupMember(g,uid)&&author===uid;
export const canLeaveGroup=(g:Group,uid:string)=>isGroupMember(g,uid)&&!isGroupOwner(g,uid);
