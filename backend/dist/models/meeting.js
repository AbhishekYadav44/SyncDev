import mongoose from 'mongoose';
const meetingSchema = new mongoose.Schema({
    meetingId: {
        type: String,
        unique: true
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});
export const Meeting = mongoose.model('Meeting', meetingSchema);
//# sourceMappingURL=meeting.js.map