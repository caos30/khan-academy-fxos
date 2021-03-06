import APIClient from "./apiclient";
import {getId, getDuration, getPoints, getYoutubeId} from "./data/topic-tree-helper";
import _ from "underscore";
import Util from "./util";
import {editorForPath} from "./renderer";
import Immutable from "immutable";

const userInfoLocalStorageName = "userInfo-3";

/**
 * Signs the user in by redirecting them to the KA auth page
 */
export const signIn = () => APIClient.signIn();

/**
 * Signs the user out and resets user data back to empty
 */
export const signOut = (editUser) => {
    localStorage.removeItem(userInfoLocalStorageName);

    editUser((user) => user.merge({
        userInfo: null,
        startedEntityIds: [],
        completedEntityIds: [],
    }));

    return APIClient.signOut();
};

/**
 * Determines if a user is signed in or not
 */
export const isSignedIn = () =>
    APIClient.isSignedIn();

const getLocalStorageName = (base, userInfo) =>
    base + "-uid-" + (userInfo.get("nickname") || userInfo.get("username"));

const completedEntityIdsLocalStorageName = _.partial(getLocalStorageName, "completed");
const startedEntityIdsLocalStorageName = _.partial(getLocalStorageName, "started");
const userVideosLocalStorageName = _.partial(getLocalStorageName, "userVideos");
const userExercisesLocalStorageName = _.partial(getLocalStorageName, "userExercises");

/**
 * Saves a userInfo object (not ImmutableJS)
 */
const saveUserInfo = (userInfo) => {
    localStorage.removeItem(userInfoLocalStorageName);
    localStorage.setItem(userInfoLocalStorageName, JSON.stringify(userInfo));
};

/**
 * Saves a list of started entities (not ImmutableJS)
 */
const saveStarted = (userInfo, startedEntityIds) => {
    localStorage.removeItem(startedEntityIdsLocalStorageName(userInfo));
    localStorage.setItem(startedEntityIdsLocalStorageName(userInfo), JSON.stringify(startedEntityIds));
};

/**
 * Saves a list of completed entities (not ImmutableJS)
 */
const saveCompleted = (userInfo, completedEntityIds) => {
    localStorage.removeItem(completedEntityIdsLocalStorageName(userInfo));
    localStorage.setItem(completedEntityIdsLocalStorageName(userInfo), JSON.stringify(completedEntityIds));
};

/**
 * Saves a list of user entities (not ImmutableJS).
 * THis is mostly used for tracking the last position of the watched video.
 */
const saveUserVideos = (userInfo, userVideos) => {
    userVideos = userVideos.map((userVideo) => {
        return {
            duration: userVideo.duration,
            last_second_watched: userVideo.last_second_watched,
            points: userVideo.points,
            video: {
                id: userVideo.id
            }
        };
    });
    localStorage.removeItem(userVideosLocalStorageName(userInfo));
    localStorage.setItem(userVideosLocalStorageName(userInfo), JSON.stringify(userVideos));
};

/**
 * Saves a list of information on the exercise.
 */
const saveUserExercises = (userInfo, userExercises) => {
    userExercises = userExercises.map((exercise) => {
        return {
            streak: exercise.streak,
            total_correct: exercise.total_correct,
            total_done: exercise.total_done,
            exercise_model: {
                content_id: exercise.exercise_model.content_id
            }
        };
    });

    // The extra removeItem calls before the setItem calls help in case local storage is almost full
    localStorage.removeItem(userExercisesLocalStorageName(userInfo));
    localStorage.setItem(userExercisesLocalStorageName(userInfo), JSON.stringify(userExercises));
};

/**
 * Loads all of the different types of user data from local storage.
 */
const loadLocalStorageData = (userInfo) => {
    var result = {};
    var completedEntityIds = localStorage.getItem(completedEntityIdsLocalStorageName(userInfo));
    if (completedEntityIds) {
        result.completedEntityIds = JSON.parse(completedEntityIds);
    }
    var startedEntityIds = localStorage.getItem(startedEntityIdsLocalStorageName(userInfo));
    if (startedEntityIds) {
        result.startedEntityIds = JSON.parse(startedEntityIds);
    }
    var userVideos = localStorage.getItem(userVideosLocalStorageName(userInfo));
    if (userVideos) {
        result.userVideos = JSON.parse(userVideos);
    }
    var userExercises = localStorage.getItem(userExercisesLocalStorageName(userInfo));
    if (userExercises) {
        result.userExercises = JSON.parse(userExercises);
    }

    return result;
};

/**
 * Reports video progress for the user back to KA
 */
export const reportVideoProgress = (user, topicTreeNode, secondsWatched, lastSecondWatched, editVideo, editUser) => {
    return new Promise((resolve, reject) => {
        const youTubeId = getYoutubeId(topicTreeNode),
            videoId = getId(topicTreeNode),
            duration = getDuration(topicTreeNode),
            editCompletedEntityIds = editorForPath(editUser, "completedEntityIds"),
            editStartedEntityIds = editorForPath(editUser, "startedEntityIds"),
            editUserInfo = editorForPath(editUser, "userInfo"),
            editUserVideos = editorForPath(editUser, "userVideos");
        let completedEntityIds = user.get("completedEntityIds"),
            startedEntityIds = user.get("startedEntityIds"),
            userVideos = user.get("userVideos");

        APIClient.reportVideoProgress(videoId, youTubeId, secondsWatched, lastSecondWatched).then((result) => {
            if (!result) {
                Util.warn("Video progress report returned null results!");
                return;
            }
            Util.log("reportVideoProgress result: %o", result);

            var lastPoints = getPoints(topicTreeNode);
            var newPoints = lastPoints + result.points_earned;
            if (newPoints > 750) {
                newPoints = 750;
            }

            // If they've watched some part of the video, and it's not almost the end
            // Otherwise check if we already have video progress for this item and we
            // therefore no longer need it.
            if (result.last_second_watched > 10 &&
                    duration - result.last_second_watched > 10) {
                lastSecondWatched = result.last_second_watched;
            }

            // If we're just getting a completion of a video update
            // the user's overall points locally.
            if (result.points_earned > 0) {
                var userInfo = user.get("userInfo");
                userInfo = userInfo.set("points",
                    userInfo.get("points") + result.points_earned);
                editUserInfo(() => userInfo);
                saveUserInfo(userInfo);
            }

            editVideo((video) =>
                video.merge({
                    points: newPoints,
                    completed: result.is_video_completed,
                    started: !result.is_video_completed,
                    lastSecondWatched: lastSecondWatched
                }));

            // Update locally stored cached info
            if (result.is_video_completed) {
                if (startedEntityIds.contains(getId(topicTreeNode))) {
                    startedEntityIds = startedEntityIds.remove(startedEntityIds.indexOf(getId(topicTreeNode)));
                    editStartedEntityIds(() => startedEntityIds);
                }
                if (!completedEntityIds.contains(getId(topicTreeNode))) {
                    completedEntityIds = completedEntityIds.unshift(getId(topicTreeNode));
                    editCompletedEntityIds(() => completedEntityIds);
                }
            } else {
                if (!startedEntityIds.contains(getId(topicTreeNode))) {
                    startedEntityIds = startedEntityIds.unshift(getId(topicTreeNode));
                    editStartedEntityIds(() => startedEntityIds);
                }
            }

            var foundUserVideo = userVideos.find((info) =>
                info.getIn(["video", "id"]) === getId(topicTreeNode));
            if (foundUserVideo) {
                foundUserVideo = foundUserVideo.toJS();
            }
            var isNew = !foundUserVideo;
            foundUserVideo = foundUserVideo || {
                video: {
                    id: getId(topicTreeNode)
                },
                duration: getDuration(topicTreeNode)
            };
            foundUserVideo.points = newPoints;
            foundUserVideo.last_second_watched = lastSecondWatched;
            if (isNew) {
                userVideos = userVideos.unshift(Immutable.fromJS(foundUserVideo));
                editUserVideos(() => userVideos);
            }

            saveStarted(user.get("userInfo"), startedEntityIds);
            saveCompleted(user.get("userInfo"), completedEntityIds);
            saveUserVideos(user.get("userInfo"), userVideos);

            resolve({
                completed: result.is_video_completed,
                lastSecondWatched: result.last_second_watched,
                pointsEarned: result.points_earned,
                youtubeId: result.youtube_id,
                videoId,
                id: getId(topicTreeNode)
            });
        }).catch(() => {
            reject();
        });
    });
};

/**
 * Reports article progress for the user back to KA
 */
export const reportArticleRead = (user, topicTreeNode, editUser) => {
    return new Promise((resolve, reject) => {
        if (!isSignedIn()) {
            return setTimeout(resolve, 0);
        }

        APIClient.reportArticleRead(getId(topicTreeNode)).then((result) => {
            Util.log("reported article complete: %o", result);
            let completedEntityIds = user.get("completedEntityIds");
            if (!completedEntityIds.contains(getId(topicTreeNode))) {
              completedEntityIds = completedEntityIds.unshift(getId(topicTreeNode));
              const editCompletedEntityIds = editorForPath(editUser, "completedEntityIds");
              editCompletedEntityIds(() => completedEntityIds);
            }
            saveCompleted(user.get("userInfo"), completedEntityIds);
            resolve(result);
        }).catch(() => {
            reject();
        });
    });
};

/**
 * Refreshes the logged in info either from local storage or from the server
 */
export const refreshLoggedInInfo = (user, editUser, forceRefreshAllInfo) => {
    return new Promise((resolve, reject) => {
        if (!isSignedIn()) {
            return resolve();
        }

        var userInfo = user.get("userInfo");
        // Get the user profile info
        APIClient.getUserInfo().then((result) => {
            Util.log("getUserInfo: %o", result);
            userInfo = Immutable.fromJS({
                avatarUrl: result.avatar_url,
                joined: result.joined,
                nickname: result.nickname,
                username: result.username,
                points: result.points,
                badgeCounts: result.badge_counts
            });

            const editUserInfo = editorForPath(editUser, "userInfo");
            editUserInfo(() => userInfo);

            saveUserInfo(userInfo.toJS());

            result = loadLocalStorageData(userInfo);
            if (!forceRefreshAllInfo && result.completedEntityIds && result.startedEntityIds) {
                Util.log("User info only obtained. Not obtaining user data because we have it cached already!");
                return result;
            }

            // The call is needed for completed/in progress status of content items
            // Unlike getUserVideos, this includes both articles and videos.
            return APIClient.getUserProgress();

        }).then((data) => {
            Util.log("getUserProgress: %o", data);
            // data.complete will be returned from the API but not when loaded
            // directly from localStorage.  When loaded directly from localstorage
            // you'll already have result.startedEntityIds.
            if (data.complete) {
                // Get rid of the 'a' and 'v' prefixes, and set the completed / started
                // attributes accordingly.
                data.startedEntityIds = _.map(data.started, function(e) {
                    return e.substring(1);
                });
                data.completedEntityIds = _.map(data.complete, function(e) {
                    return e.substring(1);
                });

                // Save to local storage
                saveStarted(userInfo, data.startedEntityIds);
                saveCompleted(userInfo, data.completedEntityIds);
            }

            editUser((userData) => userData.merge({
                startedEntityIds: data.startedEntityIds,
                completedEntityIds: data.completedEntityIds,
            }));

            return APIClient.getUserVideos();
        }).then((userVideosResults) => {
            saveUserVideos(userInfo, userVideosResults);
            return APIClient.getUserExercises();
        }).then((userExercisesResults) => {
            saveUserExercises(userInfo, userExercisesResults);
            resolve();
        }).catch(() => {
            reject();
        });
    });
};
