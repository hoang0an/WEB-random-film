import type {Store} from './domain.ts';
import type {AccountProfile} from './account-types.ts';

// Group polling can return a snapshot older than an account save. Overlay only
// the current user's canonical public fields, never their email or cover.
export function withAccountProfile(store: Store, profile: AccountProfile | null): Store {
  if (!profile) return store;
  return {...store, groups: store.groups.map(group => ({...group,
    members: group.members.map(member => member.id === profile.id ? {...member, name: profile.name, avatarPath: profile.avatarPath} : member),
    ratings: group.ratings.map(rating => rating.userId === profile.id ? {...rating, name: profile.name} : rating),
    comments: group.comments.map(comment => comment.userId === profile.id ? {...comment, name: profile.name, avatarPath: profile.avatarPath} : comment),
    movies: group.movies.map(movie => movie.addedBy === profile.id ? {...movie, addedName: profile.name} : movie)
  }))};
}
