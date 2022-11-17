const fetch = require('node-fetch')
const queryString = require('query-string')
const axios = require('axios')
const crypto = require('crypto')
const _ = require('lodash')

exports.sourceNodes =  async ({ actions, createNodeId, createContentDigest }, configOptions) => {
  const { createNode } = actions

  delete configOptions.plugins

  const processPost = post => {
    const nodeId = createNodeId(`hubspot-post-${post.id}`)
    const nodeContent = JSON.stringify(post)
    const nodeContentDigest = crypto
      .createHash('md5')
      .update(nodeContent)
      .digest('hex')

    const nodeData = Object.assign({}, post, {
      id: nodeId,
      parent: null,
      children: [],
      internal: {
        type: `HubspotPost`,
        content: nodeContent,
        contentDigest: nodeContentDigest
      }
    })

    return nodeData
  }
  const topics = []
  const API_KEY = configOptions.key
  if (!API_KEY) throw new Error('No Hubspot API key provided')
  const apiCall = async function(url){
    const apiResponse = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    const data = _.get(apiResponse, 'data')
    return data
  };

  const recursiveCallApi = async function(results, isTopic) {
    const nextPageLink = _.get(results, 'paging.next.link', null)
    if(isTopic) {
      results.objects.map((topic) => {
        const topicParsed = {
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          description: topic.description,
        }
        topics.push(topicParsed)
      })
    }
    if(nextPageLink) {
      const resultsRecursived = await apiCall(nextPageLink)
      if(!isTopic) {
        const cleanData = resultsRecursived.results.map(post => {
          const p = {
            id: post.id,
            title: post.htmlTitle,
            body: post.post_body,
            state: post.state,
            topics: [],
            author: post.blog_post_author
              ? {
                  id: post.blog_post_author.id,
                  avatar: post.blog_post_author.avatar,
                  name: post.blog_post_author.display_name,
                  full_name: post.blog_post_author.full_name,
                  bio: post.blog_post_author.bio,
                  email: post.blog_post_author.email,
                  facebook: post.blog_post_author.facebook,
                  google_plus: post.blog_post_author.google_plus,
                  linkedin: post.blog_post_author.linkedin,
                  twitter: post.blog_post_author.twitter,
                  twitter_username: post.blog_post_author.twitter_username,
                  website: post.blog_post_author.website,
                  slug: post.blog_post_author.slug
                }
              : null,
            feature_image: {
              url: post.featuredImage,
              alt_text: post.featuredImageAltText
            },
            meta: {
              title: post.page_title,
              description: post.meta_description
            },
            campaign: post.campaign
              ? {
                  id: post.campaign,
                  name: post.campaign.campaign_name
                }
              : null,
            summary: post.postSummary,
            published: post.publish_date,
            updated: post.updated,
            created: post.created,
            slug: post.slug,
            url: post.url
          }

          return p
        })
        cleanData.forEach(post => {
          const nodeData = processPost(post)
          createNode(nodeData)
        })
      }
      await recursiveCallApi(resultsRecursived, isTopic)
    } else {
      return
    }
  }
  const API_ENDPOINT_TOPIC = 'https://api.hubapi.com/blogs/v3/topics?limit=100'
  const API_ENDPOINT_POSTS = 'https://api.hubapi.com/cms/v3/blogs/posts?limit=90'
  console.log(
    '\n  gatsby-source-hubspot\n  ------------------------- \n  Fetching post topics from: \x1b[33m',
    `\n  ${API_ENDPOINT_TOPIC}\x1b[0m\n`,
    ' Fetching posts from: \x1b[33m',
    `\n  ${API_ENDPOINT_POSTS}\x1b[0m\n`
  )
  const firstCallTopics = await apiCall(API_ENDPOINT_TOPIC)
  await recursiveCallApi(firstCallTopics, true)
  const firstCallPosts = await apiCall(API_ENDPOINT_POSTS)
  await recursiveCallApi(firstCallPosts, false)
}