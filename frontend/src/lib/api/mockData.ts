import { type Profile } from "./types";

export const profiles: Profile[] = [
  {
    id: "p-ruoyun",
    displayName: "林若云",
    bio: "策展古籍，漫步山寺，喜欢在安静中与人建立深层连接。",
    calling: "古籍策展人",
    city: "杭州",
    interests: ["宋词", "茶事", "古琴"],
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "p-linyu",
    displayName: "林语",
    bio: "修复古卷，也修复被日常磨损的耐心，偏爱慢节奏关系。",
    calling: "卷轴修复师",
    city: "苏州",
    interests: ["书法", "造纸", "雨中散步"],
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "p-zeyuan",
    displayName: "林泽远",
    bio: "数字档案员，擅长把古典文本变成可被当代阅读的经验。",
    calling: "数字档案员",
    city: "南京",
    interests: ["古典文本", "博物馆设计", "竹林漫游"],
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
  },
];

export const meProfile: Profile = {
  id: "p-me",
  displayName: "你",
  bio: "我喜欢有留白感的关系，偏爱温柔而深刻的交流。",
  calling: "产品设计师",
  city: "上海",
  interests: ["设计", "诗歌", "长距离散步"],
  avatar:
    "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=80",
};
