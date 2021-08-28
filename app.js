const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
const router = express.Router();
const cheerio = require("cheerio");
const http = require("http");
const axios = require("axios");
var request = require("request");
const socketio = require("socket.io");
const compression = require("compression");
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require("constants");
app.use(compression());
app.use(cors());
app.use(express.urlencoded({extended:true}));
app.use(express.json());
var port = process.env.PORT || 3000;
app.set("views",__dirname+"/client/views");
app.engine("html",require("ejs").renderFile);
app.set("view engine", "ejs");
app.use(express.static(path.resolve(__dirname,"client")));
app.get("/", (req,res)=>{
    res.render("home");
});


app.get("/getpost/:id/:username", async(req,res) => {
    var uri = "http://medium.com/post/" + req.params.id;
    function makereq(uri){
        return new Promise((resolve,reject) => {
            request(uri, async(err, res, html) => {
                if(!err && res.statusCode==200){
                    var $ = cheerio.load(html);
                    var article = $("p").text();
                    resolve(article);
                }
            });
        });
    }
    var articles = await makereq(uri);

    var responseurl = "https://medium.com/_/api/posts/" + req.params.id + "/responsesStream?filter=other";
    var p = await axios.get(responseurl);

    var response = JSON.parse(p.data.slice(16));

    var flag = Object.keys(response.payload.references);
    var finalcomments = [];
    var resnamearray = [];
    var commentarray = [];
    if(flag.length > 0){
        var user = response.payload.references.User;
        var xyz = Object.keys(user);
        for(var a =0; a<xyz.length;a++){
            resnamearray.push({
                name:response.payload.references.User[xyz[a]].name,
                id: xyz[a],
            });
        }
        var commentpost = response.payload.references.Post;
        var commentvalues = Object.values(commentpost);
        for(var c =0; c<commentvalues.length;c++){
            commentarray.push({
                id:commentvalues[c].creatorId,
                text:commentvalues[c].previewContent.bodyModel.paragraphs[0].text,
            });
        }
        for(var d=0;d<resnamearray.length;d++){
            for(var e=0;e<commentarray.length;e++){
                if(
                    (resnamearray[d].id == commentarray[e].id) && (resnamearray[d].name!=req.params.username)
                ){
                    finalcomments.push({
                        name:resnamearray[d].name,
                        comment:commentarray[e].text,
                    });
                }
            }
        }
    }
    else{
        finalcomments=[{
            name:"no response",
            comment:"no response for this post",
        },];
    }
    console.log("comment function working");
    return res.render("comments",{
        articles:articles,
        finalcomments:finalcomments,
    })
})

var server = http.createServer(app);
const io = socketio(server);

io.on("connection", async (socket) => {
    console.log("New User Connected");
    socket.on("sendtag", async(tags)=>{
        
        var tag = tags.toLowerCase();
        var url = "https://medium.com/_/api/tags/" + tag + "/stream?";
        console.log(url);
        var a = await axios.get(url);
        const b = JSON.parse(a.data.slice(16));
        
        var k = b.payload.relatedTags;
        var related = [];
        for (var i =0;i<k.length;i++){
            related.push(k[i].name);
        }
        var relatedlength = k.length;
    

        socket.emit("sendrelatedpost", {
            related:related,
            relatedlength:relatedlength,
            postlength: b.payload.streamItems.length,
        });

        var streamitem = b.payload.streamItems;

        var username;
        var titlename;
        var readingtime;

        for(var i=0;i<streamitem.length;i++){
            var starttime = new Date().getTime();
            socket.emit("startedfetching", {idno:i, msg: "Crawling..."});
            var l = streamitem[i].postPreview.postId;
            var uri = "http://medium.com/post/" + l;
            var creatorId = b.payload.references.Post[l].creatorId;
            username = b.payload.references.User[creatorId].name;
            titlename = b.payload.references.Post[l].title;
            readingtime = Math.round(b.payload.references.Post[l].virtuals.readingTime);

            var imageid = b.payload.references.Post[l].virtuals.previewImage.imageId;
            var imageurl = "https://miro.medium.com/max/600/" + imageid;

            function makerq(uri) {
                return new Promise ((resolve, reject) => {
                    request(uri, async (err, res, html) => {
                        if(!err && res.statusCode ==200) {
                            var $ = cheerio.load(html);
                            var article = $("p").text();
                            resolve(article);
                        }
                    });
                });
            }
            var articlecont = await makerq(uri);
            var crawltime = new Date().getTime() - starttime;
            var postrelatedtags = [];
            for(var p = 0; p<b.payload.references.Post[l].virtuals.tags.length;p++){
                postrelatedtags.push(b.payload.references.Post[l].virtuals.tags[p].name);
            }
            obj = {
                imageurl:imageurl,
                username:username,
                id:i,
                titlename:titlename,
                crawltime:crawltime,
                readingtime:readingtime,
                articles:articlecont,
                postrelatedtags:postrelatedtags,
                postid:l,
            };
            socket.emit("senddata", {obj:obj});
        }
    });
});

server.listen(port,()=>{
    console.log("Server is listening");
});

module.exports=app;