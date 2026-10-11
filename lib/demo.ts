import type { Movie, Store } from './domain';
export const demoUser = { id: 'demo-you', name: 'Bạn' };
const demoGenres: Record<number, string[]> = {
  157336: ['Khoa học viễn tưởng', 'Phiêu lưu', 'Chính kịch'],
  27205: ['Khoa học viễn tưởng', 'Hành động', 'Phiêu lưu'],
  129: ['Hoạt hình', 'Gia đình', 'Giả tưởng'],
  313369: ['Lãng mạn', 'Chính kịch'],
  120: ['Phiêu lưu', 'Giả tưởng', 'Hành động'],
  496243: ['Chính kịch', 'Giật gân'],
  346698: ['Hài', 'Phiêu lưu', 'Giả tưởng'],
  569094: ['Hoạt hình', 'Hành động', 'Phiêu lưu'],
  194: ['Hài', 'Lãng mạn'],
};
export const catalog: Movie[] = [
  { id: 157336, title: 'Interstellar', originalTitle: 'Hố đen tử thần', year: '2014', runtime: 169, overview: 'Khi Trái Đất dần trở nên không thể sinh sống, một nhóm phi hành gia vượt qua hố sâu vũ trụ để tìm một mái nhà mới cho nhân loại. Một chuyến đi về thời gian, tình yêu và những điều giữ chúng ta ở lại.', poster: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', backdrop: '/xJHokMbljvjADYdit5fK5VQsXEG.jpg' },
  { id: 27205, title: 'Inception', originalTitle: 'Kẻ đánh cắp giấc mơ', year: '2010', runtime: 148, overview: 'Dom Cobb có khả năng đánh cắp bí mật trong giấc mơ. Một nhiệm vụ cuối cùng đòi hỏi anh gieo một ý tưởng vào tâm trí thay vì lấy nó đi.', poster: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg' },
  { id: 129, title: 'Spirited Away', originalTitle: 'Vùng đất linh hồn', year: '2001', runtime: 125, overview: 'Cô bé Chihiro lạc vào thế giới linh hồn và phải tìm cách cứu cha mẹ. Một cuộc phiêu lưu dịu dàng về lòng can đảm và sự trưởng thành.', poster: '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg' },
  { id: 313369, title: 'La La Land', year: '2016', runtime: 128, overview: 'Một nghệ sĩ piano và một diễn viên trẻ gặp nhau ở Los Angeles. Giữa âm nhạc, ước mơ và tình yêu, họ tìm con đường của riêng mình.', poster: '/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg' },
  { id: 120, title: 'The Lord of the Rings', year: '2001', runtime: 178, overview: 'Frodo cùng những người bạn bước vào hành trình phá hủy chiếc nhẫn quyền lực, đối mặt với hiểm nguy trên khắp Trung Địa.', poster: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg' },
  { id: 496243, title: 'Parasite', originalTitle: 'Ký sinh trùng', year: '2019', runtime: 132, overview: 'Hai gia đình ở hai phía của khoảng cách giàu nghèo bị cuốn vào một chuỗi sự kiện bất ngờ khi cuộc sống của họ giao nhau.', poster: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' },
  { id: 346698, title: 'Barbie', year: '2023', runtime: 114, overview: 'Barbie rời thế giới hoàn hảo của mình và khám phá cuộc sống ngoài đời thực, với những câu hỏi mới về bản thân.', poster: '/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg' },
  { id: 569094, title: 'Spider-Man: Across the Spider-Verse', year: '2023', runtime: 140, overview: 'Miles Morales gặp những Người Nhện từ nhiều vũ trụ và phải lựa chọn con đường để bảo vệ những người mình yêu thương.', poster: '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg' },
  { id: 194, title: 'Amélie', year: '2001', runtime: 122, overview: 'Một cô gái ở Paris giúp những người xung quanh tìm thấy niềm vui trong những điều bé nhỏ, rồi học cách mở lòng với hạnh phúc của chính mình.', poster: '/nSxDa3M9aMvGVLoItzWTepQ5h5d.jpg' },
  { id: 999000, title: 'Phim mẫu không có poster', year: '2026', runtime: null, overview: 'Dữ liệu mẫu để thử trường hợp thiếu poster và thời lượng. Đây không phải kết quả TMDB thật.', poster: null }
].map(movie => ({...movie, genres: demoGenres[movie.id] || []}));
export function withDemoGenres(store: Store): Store {
  return {...store, groups: store.groups.map(group => ({...group, ownerId: group.ownerId || group.members[0]?.id || '', movies: group.movies.map(movie => ({...movie, genres: movie.genres ?? demoGenres[movie.id] ?? []}))}))};
}
export function initialStore(): Store {
  const names = ['Minh', 'Bạn', 'Linh', 'Minh', 'Linh', 'Bạn'];
  return { groups: [{ id: 'demo-friends', ownerId: demoUser.id, name: 'Hội mê điện ảnh', code: 'CINEMA2026', members: [demoUser, { id: 'demo-minh', name: 'Minh' }, { id: 'demo-linh', name: 'Linh' }], tonightId: null,
    movies: catalog.slice(0, 6).map((m, i) => ({ ...m, entryId: `seed-${m.id}`, addedBy: names[i] === 'Bạn' ? demoUser.id : `demo-${names[i] === 'Minh' ? 'minh' : 'linh'}`, addedName: names[i], watchedAt: null })), ratings: [], comments: [] }] };
}
export const STORAGE_KEY = 'tonight-cinema-demo-v1';
