"use strict";


const db = require('../util/db'),
      aws = require('../util/aws'),
      auth = require('../util/auth'),
      log = require('../util/log'),
      nconf = require('nconf'),
      expressJwt = require('express-jwt'),
      passport = require('passport'),
      Strategy = require('passport-local');

const authenticate = expressJwt({
  secret: nconf.get('AUTH_JWT_SECRET')
});

// protect routes unless disabled for test
const checkAuth = nconf.get('AUTH_ENABLED') ? authenticate : (req, res, next) => next();

passport.use(new Strategy( (username, password, done) => {
    auth.manager.authenticate(username, password, done);
}));

// EXPORT ROUTES
module.exports = (app, express) => {

    // create a group of API routes
    const router = express.Router();
    // set url for API group routes
    app.use('/', router);
    
    // CREATE NEW ITEM
    router.post('/api/todo/new', checkAuth, (req, res) => {

        let item = req.body;

        db.knex.insert(item)
            .into('todo')
            .returning('todo_id')
            .then( (result) => {
                let msg = `Successfully created todo item with id ${result}`;
                log.info(msg);
                res.status(200).json({'message' : msg});
            }) 
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // GET ACTIVE ITEMS ONLY
    router.get('/api/todo/active', checkAuth, (req, res) => {

        db.knex('todo')
            .where('active', 1)
            .then( (rows) => {
                log.info(`Active ToDo items found: ${rows.length}`);
                res.status(200).send(rows);
            }) 
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // UPDATE AN ACTIVE ITEM WITH NEW DESCRIPTION ETC.
    router.put('/api/todo/active', checkAuth, (req, res) => {

        let item = req.body;

        db.knex('todo')
            .where('todo_id', item.todo_id)
            .update({'description' : item.description, 'active' : item.active})
            .then( (result) => {
                let msg = 'Successfully updated todo';
                log.info(msg);
                res.status(200).json({'message' : msg});
            })
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // GET ALL ITEMS, ACTIVE AND COMPLETE
    router.get('/api/todo/all', checkAuth, (req, res) => {

        db.knex.select()
            .table('todo')
            .then( (rows) => {
                log.info(`Total number of ToDo items found: ${rows.length}`);
                res.status(200).send(rows);
            })
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // GET COMPLETE ITEMS ONLY
    router.get('/api/todo/complete', checkAuth, (req, res) => {

        db.knex('todo')
            .where('active', 0)
            .then( (rows) => {
                log.info(`Complete ToDo items found: ${rows.length}`);
                res.status(200).send(rows);
            })
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // MARK AN ACTIVE ITEM COMPLETE
    router.put('/api/todo/complete', checkAuth, (req, res) => {

        let item = req.body;

        db.knex('todo')
            .where('todo_id', item.todo_id)
            .update('active', 0)
            .then( (result) => {
                let msg = `Successfully marked complete ${result} todos`;
                log.info(msg);
                res.status(200).json({'message' : msg});
            })
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // DELETE ALL COMPLETED ITEMS
    router.delete('/api/todo/complete', checkAuth, (req, res) => {

        let item = req.body;

        db.knex('todo').where('active', 0)
            .del()
            .then( (result) => {
                let msg = `Successfully deleted ${result} completed todos`;
                log.info(msg);
                res.status(200).json({'message' : msg});
            }) 
            .catch( (err) => {
                log.error(err);
                res.status(500).json({'error' : `[DB ERROR] ${err}`});
            });
    });

    // GET AN S3 UPLOAD URL FOR UPLOADING AN OBJECT FOR A TODO ITEM
    router.get('/api/todo/s3url/:bucket/:key', checkAuth, (req, res) => {

        let bucket = req.params.bucket;
        let key = req.params.key;
        if ( !bucket || !key ) {
            let msg = '[API ERROR] S3 BUCKET PATH PARAMETERS MISSING';
            log.error(msg);
            return res.status(400).json({'error' : msg});
        }

        // Handled by the AWS utility module in the utility directory.
        // Note that this is fine for for smaller files, but as file size approaches the GB
        // range, multipart upload is a better solution.  Presigned URLs don't work with
        // multipart uploads, so use the AWS SDK multipart upload functionality instead.
        aws.getPresignedUrlForS3(bucket, key, res);
    });   
    
    // REGISTER AND LOGIN A USER
    router.post('/api/auth', passport.initialize(),
                            passport.authenticate('local', { session: false, scope: [] }),
                            auth.serialize, 
                            auth.generateAccessToken, 
                            auth.generateRefreshToken, 
                            auth.respondWithToken);
    
    // USE REFRESH TOKEN TO GET ACCESS TOKEN (request should include user id and refresh token)
    router.post('/api/token', auth.validateRefreshToken,
                             auth.generateAccessToken, 
                             auth.respondWithToken);
    
    // TODO: REVOKE REFRESH TOKEN (LIMIT TO USERS WITH ADMIN ROLE)
    // router.post('/api/token/revoke', ...

    // CHECK USER INFORMATION
    router.get('/api/me', authenticate, (req, res) => {
        
        res.status(200).json(req.user);
    });
    
    // ROUTE FOR HEALTH CHECK
    router.get('/', (req, res) => {

        res.status(200).json({'HEALTH_CHECK' : 'OK'});
    });
    
} // end module exports of routes


