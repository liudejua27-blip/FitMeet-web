import { memo, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { FeedCard } from './FeedCard';
import type { Post } from '../../types';

interface MasonryFeedProps {
  posts: Post[];
  loadMore?: () => void;
  loading?: boolean;
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onAddFriend: (id: number) => void;
  onMeetRequest: (id: number) => void;
  onMessage: (id: number) => void;
}

interface RowContentProps {
  rowData: [Post | undefined, Post | undefined];
  context: {
    onLike: (id: number) => void;
    onSave: (id: number) => void;
    onAddFriend: (id: number) => void;
    onMeetRequest: (id: number) => void;
    onMessage: (id: number) => void;
  };
}

const RowContent = memo(({ rowData, context }: RowContentProps) => {
  const { onLike, onSave, onAddFriend, onMeetRequest, onMessage } =
    context;
  const [leftPost, rightPost] = rowData;

  return (
    <div className="flex w-full flex-col gap-4 px-1 pb-4 md:flex-row">
      <div className="flex w-full flex-col md:w-1/2">
        {leftPost && (
          <FeedCard
            post={leftPost}
            onLike={onLike}
            onSave={onSave}
            onAddFriend={onAddFriend}
            onMeetRequest={onMeetRequest}
            onMessage={onMessage}
          />
        )}
      </div>
      <div className="flex w-full flex-col md:w-1/2">
        {rightPost && (
          <FeedCard
            post={rightPost}
            onLike={onLike}
            onSave={onSave}
            onAddFriend={onAddFriend}
            onMeetRequest={onMeetRequest}
            onMessage={onMessage}
          />
        )}
      </div>
    </div>
  );
});

export const MasonryFeed = memo(function MasonryFeed({
  posts,
  loadMore,
  loading,
  ...actions
}: MasonryFeedProps) {
  // Split posts into rows of 2
  const rows = useMemo(() => {
    const result: [Post | undefined, Post | undefined][] = [];
    for (let i = 0; i < posts.length; i += 2) {
      result.push([posts[i], posts[i + 1]]);
    }
    return result;
  }, [posts]);

  return (
    <Virtuoso
      useWindowScroll
      data={rows}
      endReached={loadMore}
      context={actions}
      itemContent={(_, rowData, context) => (
        <RowContent rowData={rowData} context={context} />
      )}
      components={{
        Footer: () => (
          loading ? (
            <div className="flex justify-center p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime border-t-transparent" />
            </div>
          ) : null
        ),
      }}
    />
  );
});
