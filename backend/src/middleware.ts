import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";



export const authMiddleware = (
  req: Request & { userId?: string },
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.header("Authorization");
  const jwt_password = process.env.JWT_PASSWORD ?? ""

  if (!authHeader) {
    return res.status(401).json({ message: "token not found" });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  try {
    //@ts-ignore
   
   const decoded = jwt.verify(token, jwt_password) as {id : string};

    req.userId = decoded.id; 
    next();
  } catch { 
    return res.status(403).json({ message: "Invalid or expired token" });
  }  
};
