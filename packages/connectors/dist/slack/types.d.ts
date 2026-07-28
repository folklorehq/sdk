export interface SlackUser {
    id: string;
    name: string;
    real_name?: string;
    email?: string;
}
export interface SlackReaction {
    name: string;
    count: number;
    users?: string[];
}
export interface SlackEditMarker {
    user: string;
    ts: string;
}
export interface SlackMessage {
    type?: string;
    channel: string;
    user?: string;
    text?: string;
    ts: string;
    thread_ts?: string;
    parent_user_id?: string;
    subtype?: string;
    edited?: SlackEditMarker;
    deleted_ts?: string;
    message?: SlackMessage;
    previous_message?: SlackMessage;
    reactions?: SlackReaction[];
}
export interface SlackReactionEvent {
    type: 'reaction_added' | 'reaction_removed';
    user: string;
    reaction: string;
    item: {
        type: string;
        channel: string;
        ts: string;
    };
    event_ts: string;
}
export interface SlackMessageEvent {
    type: 'event_callback';
    event: SlackMessage;
    team_id: string;
}
//# sourceMappingURL=types.d.ts.map