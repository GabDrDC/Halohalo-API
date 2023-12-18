require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const app = express()
const bodyParser = require('body-parser');
const units = require('units');
const saltRounds = 10;
const db = mysql.createConnection({
  host: process.env.DBSHOST,
  user: process.env.DBSUSER,
  password: process.env.DBSPASS,
  database: process.env.DBNAME
 });
 
 const util = require('util');
 db.query = util.promisify(db.query);
 
 
 
 
app.use(bodyParser.urlencoded({ extended: false }));

app.use(bodyParser.json());

async function authToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) return res.sendStatus(401);
  
    jwt.verify(token, process.env.secret, async (err, decodedToken) => {
      if (err) {
        console.error(err);
        return res.sendStatus(403);
      }
      try {
        req.user = {
          JobType: decodedToken.JobType,
        };
        next();
      } catch (error) {
        console.error(error);
        return res.sendStatus(500);
      }
     });
    }


    app.post('/login', function(req, res) {
        const { UserName, JobType, Password } = req.body;
        
        db.query(
            `SELECT * FROM staff_tb WHERE UserName= ? AND JobType = ?`, 
        [UserName, JobType],
        function(err, results, fields) {
         if (err) {
           console.log(err);
           res.status(500).json({ error: 'An error occurred while executing the query' });
         } else if (results.length > 0) {
           const user = results[0];
           const isValidPassword = bcrypt.compareSync(Password, user.Password);
           if (isValidPassword) {
             const payload = {
              id: user.StaffID,
              FirstName: user.FirstName,
              LastName: user.LastName,
              JobType: user.JobType,
             };
             const token = jwt.sign(payload, process.env.secret, { expiresIn: '1h' });
      

             const clockInSql = 'INSERT INTO staffclockin (StaffID, Date) VALUES (?, CURRENT_DATE)';
             db.query(clockInSql, [user.StaffID], (err, result) => {
               if (err) {
                 console.log(err);
                 res.status(500).json({ error: 'An error occurred while logging the clock in' });
               } else {
                 res.status(200).json({ token: token });
               }
             });
           } else {
             res.status(401).json({ error: 'Invalid password' });
           }
         } else {
           res.status(401).json({ error: 'Invalid username or job type' });
         }
        }
        );
      });
      




app.get("/", (req, res) => {
    res.send("Halo-Halo API is now ready to serve!");
  });

app.get('/menu', (req, res) => {
    let sql = 'SELECT * FROM menu_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
   });


   app.get('/staff',authToken, (req, res) => {
    let sql = 'SELECT * FROM staff_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      let staffInfo = result.map(staff => {
        return {
          StaffID: staff.StaffID,
          FirstName: staff.FirstName,
          LastName: staff.LastName,
          JobType: staff.JobType
        };
      });
      res.send(staffInfo);
    });
  });


  app.post('/staff/register', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
      return res.sendStatus(403);
    }
  
    let sql = 'INSERT INTO staff_tb SET ?';
    let newStaff = {
        UserName: req.body.UserName,
        FirstName: req.body.FirstName,
        LastName: req.body.LastName,
        JobType: req.body.JobType,
        Password: bcrypt.hashSync(req.body.Password, saltRounds)
    };
    db.query(sql, newStaff, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
  });
  
  app.delete('/staff/delete', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
    return res.sendStatus(403);
    }
    
    let sql = 'DELETE FROM staff_tb WHERE FirstName = ? AND LastName = ?';
    let staff = [req.body.FirstName, req.body.LastName];
    db.query(sql, staff, (err, result) => {
    if (err) throw err;
    if (result.affectedRows > 0) {
    res.send('Staff Member Deleted from Database');
    } else {
    res.send('Staff Member not on Database');
    }
    });
   });


   app.delete('/clockin/delete', (req, res) => {
    const userName = req.body.UserName;

    db.query('SELECT StaffID FROM staff_tb WHERE UserName = ?', [userName], (error, results) => {
    if (error) throw error;
    
    const staffID = results[0].StaffID;
    
   db.query('DELETE FROM staffclockin WHERE StaffID = ?', [staffID], (error, results) => {
     if (error) throw error;
     
     res.json({ message: 'Staff clock-in records deleted successfully' });
    });
    });
   });


 

   app.delete('/stock/delete', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
      return res.sendStatus(403);
    }
   
    let sql = 'SELECT EXISTS(SELECT * FROM stock_tb WHERE StockName = ?) AS StockExists';
    let stock = [req.body.StockName];
    db.query(sql, stock , (err, result) => {
      if (err) throw err;
      if (result[0].StockExists) {
        let sql = 'DELETE FROM stock_tb WHERE StockName = ?';
        db.query(sql, stock, (err, result) => {
          if (err) throw err;
          res.send('Stock Unlisted');
        });
      } else {
        res.send('Stock does not exist');
      }
    });
  });


  app.delete('/restock/delete', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
      return res.sendStatus(403);
    }
    
    let sql = 'SELECT EXISTS(SELECT * FROM restock_tb WHERE Name = ?) AS RestockExists';
    let restock = [req.body.Name];
    db.query(sql, restock, (err, result) => {
      if (err) throw err;
      if (result[0].RestockExists) {
        let sql = 'DELETE FROM restock_tb WHERE Name = ?';
        db.query(sql, restock, (err, result) => {
          if (err) throw err;
          res.send('Restock Unlisted');
        });
      } else {
        res.send('Restock does not exist');
      }
    });
   });



   
  app.delete('/supply/delete', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
      return res.sendStatus(403);
    }
    
    let sql = 'SELECT EXISTS(SELECT * FROM supply_tb WHERE SupplyID = ?) AS RestockExists';
    let SupplyID = [req.body.SupplyID];
    db.query(sql, SupplyID, (err, result) => {
      if (err) throw err;
      if (result[0].RestockExists) {
        let sql = 'DELETE FROM supply_tb WHERE SupplyID = ?';
        db.query(sql, SupplyID , (err, result) => {
          if (err) throw err;
          res.send('Supply Unlisted');
        });
      } else {
        res.send('Supply does not exist');
      }
    });
   });
   



   app.post('/order/new', (req, res) => {
    const orderItems = req.body.orderItems;

    orderItems.forEach(async (item) => {
      const { stockName, quantity } = item;


      const result = await new Promise((resolve, reject) => {
        db.query('SELECT StockID, QuantityLeft FROM stock_tb WHERE StockName = ?', [stockName], (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });

      const currentQuantityLeft = result[0].QuantityLeft;
      const stockID = result[0].StockID;


      if (quantity > currentQuantityLeft) {
        res.json({ message: 'Cannot process order for ' + stockName + '. Not enough quantity left.' });
        return;
      }

      await new Promise((resolve, reject) => {
       db.query('UPDATE stock_tb SET QuantityLeft = ? WHERE StockID = ?', [currentQuantityLeft - quantity, stockID], (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });
    });

    res.json({ message: 'Stock updated successfully' });
  });
  
  
   app.get('/order/all', authToken,(req, res) => {
    let sql = 'SELECT * FROM orderdetails_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
   });



  app.get('/restock', authToken,(req, res) => {
        let sql = 'SELECT * FROM restock_tb';
        db.query(sql, (err, result) => {
        if (err) throw err;
        res.send(result);
        });
    });

    app.post('/restock/new', authToken, (req, res) => {
        let sql = 'SELECT StockID FROM stock_tb WHERE StockName = ?';
        db.query(sql, [req.body.StockName], (err, result) => {
            if (err) throw err;
            if (result.length > 0) {
                let sql = 'INSERT INTO restock_tb (Name, StockID,MeasurementPerQuantity ) VALUES (?, ?,?)';
                db.query(sql, [req.body.Name, result[0].StockID,req.body.MeasurementPerQuantity], (err, result) => {
                    if (err) throw err;
                    res.send('Record inserted successfully');
                });
            } else {
                res.send('StockName does not exist');
            }
        });
     });

   app.get('/stock/all', authToken, (req, res) => {
    let sql = 'SELECT * FROM stock_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
 });
 


 app.post('/stock/new', authToken, (req, res) => {
  const { StockName, MeasureUsed } = req.body;
  let QuantityLeft = 0;
  let sql = 'INSERT INTO stock_tb (StockName, QuantityLeft, MeasurementUsed) VALUES (?, ?, ?)';
  db.query(sql, [StockName, QuantityLeft, MeasureUsed], (err, result) => {
      if (err) {
          console.log(err);
          res.status(500).json({ error: 'An error occurred while executing the query' });
      } else {
          res.status(200).json({ message: 'Stock added successfully' });
      }
  });
});

   app.post('/menu/new', authToken, (req, res) => {
    const { ItemName, Price } = req.body;
   
    if (req.user.JobType !== 'Manager') {
      return res.sendStatus(403);
    }
   
    let sql = 'SELECT EXISTS(SELECT * FROM menu_tb WHERE Name = ?) AS ItemExists';
    let menuItem = [ItemName];
    db.query(sql, menuItem, (err, result) => {
      if (err) throw err;
      if (result[0].ItemExists) {
        res.send('Item already exists');
      } else {
        let sql = 'INSERT INTO menu_tb (Name, Price) VALUES (?, ?)';
        db.query(sql, [ItemName, Price], (err, result) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: 'An error occurred while executing the query' });
          } else {
            res.status(200).json({ message: 'Item added successfully' });
          }
        });
      }
    });
   });

   

   app.post('/recipe/new', authToken, (req, res) => {
    const { ItemName, recipe } = req.body;
   
    let sql = 'SELECT ItemID FROM menu_tb WHERE Name = ?';
    let menuItem = [ItemName];
    db.query(sql, menuItem, (err, result) => {
    if (err) throw err;
    if (result.length > 0) {
     let ItemID = result[0].ItemID;
     let sql = 'SELECT * FROM ingredients_tb WHERE ItemID = ?';
     db.query(sql, [ItemID], (err, result) => {
       if (err) throw err;
       if (result.length === 0) {
         recipe.forEach(ingredient => {
           let sql = 'INSERT INTO ingredients_tb (ItemID, StockName, Quantity, Measurement) VALUES (?, ?, ?, ?)';
           let values = [ItemID, ingredient.StockName, ingredient.Quantity, ingredient.Measurement];
           db.query(sql, values, (err, result) => {
             if (err) throw err;
           });
         });
         res.send('Recipe added successfully');
       } else {
         res.send('Recipe already exists for this item');
       }
     });
    } else {
     res.send('Item does not exist');
    }
    });
   });
   
   

   app.delete('/menu/delete', authToken, (req, res) => {
    if (req.user.JobType !== 'Manager') {
     return res.sendStatus(403);
    }
   
    let sql = 'SELECT EXISTS(SELECT * FROM menu_tb WHERE Name = ?) AS ItemExists';
    let menuItem = [req.body.ItemName];
    db.query(sql, menuItem, (err, result) => {
    if (err) throw err;
    if (result[0].ItemExists) {
      let sql = 'DELETE FROM ingredients_tb WHERE ItemID IN (SELECT ItemID FROM menu_tb WHERE Name = ?)';
      db.query(sql, menuItem, (err, result) => {
        if (err) throw err;
        let sql = 'DELETE FROM menu_tb WHERE Name = ?';
        db.query(sql, menuItem, (err, result) => {
          if (err) throw err;
          res.send('Item Unlisted');
        });
      });
    } else {
      res.send('Item does not exist');
    }
    });
   });
   
   

   app.get('/menu/ingredients', authToken, (req, res) => {
    const { ItemName } = req.body;
    
    let sql = 'SELECT ItemID FROM menu_tb WHERE Name = ?';
    let menuItem = [ItemName];
    db.query(sql, menuItem, (err, result) => {
    if (err) throw err;
    if (result.length > 0) {
     let ItemID = result[0].ItemID;
     let sql = 'SELECT * FROM ingredients_tb WHERE ItemID = ?';
     db.query(sql, [ItemID], (err, result) => {
       if (err) throw err;
       let ingredients = result.map(ingredient => {
         return `${ingredient.Quantity} ${ingredient.Measurement} ${ingredient.StockName}`;
       });
       if (ingredients.length === 0) {
         res.json({Item: ItemName, Message: 'Required ingredients need to be added.'});
       } else {
         res.json({Item: ItemName, Ingredients: ingredients});
       }
     });
    } else {
     res.json({Item: ItemName, Message: 'Item does not exist'});
    }
    });
   });
   
   
 


 
 

   app.get('/supply',authToken, (req, res) => {
    let sql = 'SELECT * FROM supply_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
   });


   app.get('/stock/status', authToken, (req, res) => {
    let sql = 'SELECT * FROM stock_tb WHERE StockName = ?';
    let StockName = [req.body.StockName];
    db.query(sql, StockName, (err, result) => {
    if (err) throw err;
    let expiryDate = new Date(result[0].ExpiryDate);
    let currentDate = new Date(); 
    result[0].StockStatus = expiryDate > currentDate ? 'Usable' : 'Expired';
    

    if (result[0].QuantityLeft < 500) {
     result[0].StockStatus += ', Please Resupply';
    } else if (result[0].QuantityLeft < 10) {
     result[0].StockStatus += ', Quantity is very low';
    }
    

    if (result[0].QuantityLeft > 100 && expiryDate < currentDate) {
     result[0].StockStatus += ', Do Not Serve to Customers, Product is Expired';
    }
    
    res.send(result[0]);
    });
   });


   app.get('/stock/status/all', authToken, (req, res) => {
    let sql = 'SELECT * FROM stock_tb';
    db.query(sql, (err, result) => {
     if (err) throw err;
     result.forEach(item => {
       let expiryDate = new Date(item.ExpiryDate);
       let currentDate = new Date(); 
       item.StockStatus = expiryDate > currentDate ? 'Usable' : 'Expired';
   

       if (item.QuantityLeft < 50) {
         item.StockStatus += ', Please Resupply';
       } else if (item.QuantityLeft < 10) {
         item.StockStatus += ', Quantity is very low';
       }

       if (item.QuantityLeft > 100 && expiryDate < currentDate) {
         item.StockStatus += ', Do Not Serve to Customers, Product is Expired';
       }
     });
     res.json(result);
    });
   });


   app.get('/stock/status/all/v2', authToken, (req, res) => {
    let sql = 'SELECT * FROM stock_tb';
    db.query(sql, (err, result) => {
    if (err) throw err;
    let itemsNeedRestock = [];
    let itemsExpired = [];
    result.forEach(item => {
    let expiryDate = new Date(item.ExpiryDate);
    let currentDate = new Date(); 
    item.StockStatus = expiryDate > currentDate ? 'Usable' : 'Expired';
   

    if (item.QuantityLeft < 50) {
    itemsNeedRestock.push({Item: item.StockName, QuantityLeft: item.QuantityLeft});
    } else if (item.QuantityLeft < 10) {
    itemsNeedRestock.push({Item: item.StockName, QuantityLeft: item.QuantityLeft});
    }

    if (item.QuantityLeft > 100 && expiryDate < currentDate) {
    itemsExpired.push({Item: item.StockName, ExpiryDate: item.ExpiryDate});
    }
    });
    res.json({NeedToRestock: itemsNeedRestock, Expired: itemsExpired});
    });
   });
   

   
   
   
   
   


   
   app.get('/stock',authToken, (req, res) => {
    let sql = 'SELECT * FROM stock_tb';
    db.query(sql, (err, result) => {
      if (err) throw err;
      res.send(result);
    });
   });
   
   app.post('/supply/new', authToken, (req, res) => {
    const { StockName, Name, PriceBought, DateBought, Quantity, Measurement, ExpiryDate, MeasurementPerQuantity} = req.body;
    let sql = 'SELECT StockID FROM stock_tb WHERE StockName = ?';
    db.query(sql, [StockName], (err, result) => {
        if (err) {
            console.error('Error executing query', err);
            res.status(500).send({message: 'An error occurred while executing the query'});
            return;
        }
        console.log('StockName query executed');
        if (result.length > 0) {
            const stockData = result[0];
            let StockIDres = stockData.StockID;
            console.log('StockData:', StockIDres);
            let sql = 'INSERT INTO restock_tb (Name, StockID,MeasurementPerQuantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE Name = VALUES(Name), StockID = VALUES(StockID),MeasurementPerQuantity = VALUES(MeasurementPerQuantity)';
  
            db.query(sql, [Name, StockIDres,  MeasurementPerQuantity], (err, result) => {
                if (err) {
                 if(err.errno == 1062){
                     console.log('Duplicate entry detected');
                     res.send({message: 'Duplicate entry detected'});
                 } else {
                     console.error('Error executing query', err);
                     res.status(500).send({message: 'An error occurred while executing the query'});
                     return;
                 }
                } else {
                 console.log('Restock insert query executed');
                 let sql = 'SELECT MAX(RestockID) as id FROM restock_tb';
                 db.query(sql, (err, result) => {
                   if (err) {
                       console.error('Error executing query', err);
                       res.status(500).send({message: 'An error occurred while executing the query'});
                       return;
                   }
                   console.log('Select query executed');
                   const lastRestockID = result[0].id;
                   console.log('LastRestockID:', lastRestockID);
 
                   let sql = 'SELECT MeasurementPerQuantity FROM restock_tb WHERE RestockID = ?';
                   db.query(sql, [lastRestockID], (err, result) => {
                     if (err) {
                         console.error('Error executing query', err);
                         res.status(500).send({message: 'An error occurred while executing the query'});
                         return;
                     }
                     const MeasurementPerQuantity = result[0].MeasurementPerQuantity;
                     const NewQuantity = Quantity * MeasurementPerQuantity;

                     console.log('New Quantity:', NewQuantity );
 
                     let sql = 'INSERT INTO supply_tb (StockName, RestockID, Name, PriceBought, DateBought, Quantity, Measurement) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE StockName = VALUES(StockName), RestockID = VALUES(RestockID), Name = VALUES(Name), PriceBought = VALUES(PriceBought), DateBought = VALUES(DateBought), Quantity = VALUES(Quantity), Measurement = VALUES(Measurement)';
                     db.query(sql, [StockName, lastRestockID, Name, PriceBought, DateBought, Quantity, Measurement], (err, result) => {
                         if (err) {
                             if(err.errno == 1062){
                                console.log('Duplicate entry detected',result);
                                res.send({message: 'Duplicate entry detected',result});
                             } else {
                                console.error('Error executing query', err);
                                res.status(500).send({message: 'An error occurred while executing the query'});
                                return;
                             }
                         } else {
                             console.log('Insert query executed',result);
                             res.send({message: 'Data inserted successfully',result});
                         }
                     });
 
                let updateSql = 'UPDATE stock_tb SET ExpiryDate = ?, QuantityLeft = QuantityLeft + ? WHERE StockName = ?';
db.query(updateSql, [ExpiryDate, NewQuantity, StockName], (err, updateResult) => {
  if (err) {
      console.error('Error executing query', err);
      res.status(500).send({message: 'An error occurred while executing the query'});
      return;
  }
});
                   });
                 });
                }
            });
        }
    });
 });
 
const PORT = process.env.PORT;
app.listen(PORT, () => {
 console.log(`Halo Halo API is running on port ${PORT}`)
});
