import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true
    },
    email: String,
    password: String
});
export const userModel = mongoose.model('userModel', userSchema);
//# sourceMappingURL=user.js.map