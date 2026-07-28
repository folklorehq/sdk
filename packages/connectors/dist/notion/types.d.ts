export interface NotionUserRef {
    id: string;
    object: 'user';
}
export interface NotionPage {
    object: 'page';
    id: string;
    created_time: string;
    last_edited_time: string;
    created_by: NotionUserRef;
    last_edited_by: NotionUserRef;
    parent: {
        type: string;
        page_id?: string;
        database_id?: string;
        workspace?: boolean;
    };
    properties: {
        title?: {
            title: Array<{
                plain_text: string;
            }>;
        };
        Name?: {
            title: Array<{
                plain_text: string;
            }>;
        };
    };
    url: string;
    archived: boolean;
}
export interface NotionComment {
    object: 'comment';
    id: string;
    parent: {
        type: 'page_id';
        page_id: string;
    };
    discussion_id: string;
    created_time: string;
    created_by: NotionUserRef;
    rich_text: Array<{
        plain_text: string;
    }>;
}
export interface NotionPageEvent {
    type: 'page.created' | 'page.updated';
    page: NotionPage;
    workspace_id: string;
    /** Snapshot body provided by the simulator (not a real Notion field). */
    body?: string;
}
export interface NotionCommentEvent {
    type: 'comment.created';
    comment: NotionComment;
    workspace_id: string;
}
//# sourceMappingURL=types.d.ts.map