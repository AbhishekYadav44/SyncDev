import dotenv, { parse } from 'dotenv'
dotenv.config()
import express from "express";
import mongoose from "mongoose";
import z from 'zod'
import { userModel } from './models/user.js';
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { authMiddleware } from './middleware.js';
import { Meeting } from './models/meeting.js';
import cors from 'cors'


const app = express();

app.use(express.json());

app.use(cors({
  origin: "*",
  credentials: true
}));

const dburl = process.env.DB_URL ?? " "
const jwt_password = process.env.JWT_PASSWORD;

async function main() {
  await mongoose.connect(dburl)
}

main().then(() => {
  console.log('db connected!')
}).catch((e) => {
  console.log('err while connecting to db', e)
})

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/api/v1/signup", async (req, res) => {


  try {

    const { username, email, password } = req.body
    console.log("username", username)


    const requiredBody = z.object({
      username: z.string(),
      email: z.string().email(),
      password: z.string()
    })

    const parsedBodywithSuccess = requiredBody.safeParse(req.body)
    if (!parsedBodywithSuccess.success) {
      res.status(400).json({
        message: "Incorrect format",
        error: parsedBodywithSuccess.error
      })
    }

    const existingUser = await userModel.findOne({ username })

    if (existingUser) {
      res.json({
        message: "user already exist"
      })

      return
    }

    const hashedpassword = await bcrypt.hash(password, 10)

    const newuser = await userModel.create({

      username: username,
      password: hashedpassword,
      email: email
    })
    console.log(newuser);

    res.status(200).json({
      message: "user created succesfully!"
    })


  } catch (e) {
    console.log(e)
    res.json({
      message: "err while creating user",

    })
  }
})


app.post("/api/v1/signin", async (req, res) => {



  try {

    const { username, password } = req.body;
    const user = await userModel.findOne({ username });

    if (!user || !user.password) {
      res.status(403).json({
        message: "User not found or missing credentials",
      });
      return
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    console.log(isPasswordCorrect)

    if (isPasswordCorrect) {

      const token = jwt.sign({ id: user.id }, jwt_password!)
      res.json({
        message: "user succesfully logged in ",
        token
      })

    } else {
      res.json({
        mesage: "Incorrect Credentials!"
      })
    }


  } catch (e) {
    res.json({
      message: "err while log in "
    })
  }

})

app.post('/api/v1/meeting/create', authMiddleware, async (req, res) => {
  console.log('hits the en  point')

  try {
    

    const meetingId = (Math.floor(10000 * Math.random() * 90000)).toString();

    //@ts-ignore
    const hostId = req.userId;

    const newmeeting = await Meeting.create({
      meetingId,
      hostId
    })

    console.log(newmeeting.meetingId)

    return res.status(200).json({
      message: "meeting created succesfully!",
      meetingId
    })

  } catch (e) {
    console.log("err while creating meeting", e);
    return res.json({
      message: "err in creating a meeting"
    })
  }

})

app.post("/api/v1/meeting/join", authMiddleware, async (req, res) => {

  try {
    const { meetingId } = req.body;

    if (!meetingId) {
      return res.status(400).json({
        message: "meetingId is required"
      });
    }

    const isMeetingExist = await Meeting.find({ meetingId })
    if (!isMeetingExist) {
      return res.status(400).json({
        message: "meeting not exist"
      })
    }

    res.status(200).json({
      message: "Joined meeting successfully",
      meetingId
    });


  } catch (e) {
    console.log('err while joining', e);
    return res.json({
      message: "err while joining the meeting"
    })
  }

})



export default app;
