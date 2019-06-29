const _ = require("lodash");
const Gitlab = require("../adapters/gitlab");
const Logger = require("../logger");
const Commit = require("./commit");

exports.getLatestAndSecondLatestTagByProjectId = async (projectId) => { // TODO: Add regex option to test the tags?
  let { tags, _link } = await Gitlab.searchTagsByProjectId(projectId);
  // Only get the latest and second latest one from the same branch
  if (!_.isEmpty(tags)) {
    const latestTag = tags.shift();
    Logger.info(`Latest tag is ${latestTag.name}`);
    if (tags.length === 0) {
      const project = await Gitlab.getRepoByProjectId(projectId);
      Logger.info("No more tag is found. Assuming project creation date is the start date");
      return [latestTag, { commit: { committed_date: project.created_at } }];
    } else {
      const latestTagBranches = await Commit.findBranchRefsByProjectIdAndSha(projectId, latestTag.commit.id);
      let secondLatestTag;
      let page = 0;

      while (!secondLatestTag) {
        for (const tag of tags) {
          const branches = await Commit.findBranchRefsByProjectIdAndSha(projectId, tag.commit.id);
          for (const branch of branches) {
            if (_.some(latestTagBranches, latestTagBranch => _.isEqual(branch, latestTagBranch))) {
              secondLatestTag = tag;
              break;
            }
          }
          if(secondLatestTag){
            Logger.info(`Found the second latest tag on page ${page + 1}. The second latest tag is ${secondLatestTag.name}`);
            break;
          }
        }
        if (!secondLatestTag && _.isFunction(_link.next)) {
          const res = await _link.next();
          tags = res.tags;
          _link = res._link;
          page++;
        }
      }

      if (latestTag && secondLatestTag) {
        return [latestTag, secondLatestTag];
      } else {
        Logger.error("Cannot find the second latest tag on the same branch.");
      }
    }
  } else {
    Logger.error("Cannot find any tags");
  }
  return [];
};

exports.getLatestTagByProjectId = async (projectId) => {
  const { tags } = await Gitlab.searchTagsByProjectId(projectId);
  if (!_.isEmpty(tags)) {
    return tags[0];
  }
  return null;
};

exports.upsertTagDescriptionByProjectIdAndTag = async (projectId, tag, description) => {
  if (_.get(tag, "release.description")) {
    Logger.debug(`Updating the release note`);
    return Gitlab.updateTagReleaseByProjectIdTagNameAndTagId(projectId, tag.name, { description });
  } else {
    Logger.debug(`Creating a new release note`);
    return Gitlab.createTagReleaseByProjectIdTagNameAndTagId(projectId, tag.name, { description });
  }
};