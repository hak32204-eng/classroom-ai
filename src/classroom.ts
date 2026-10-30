/**
 * Google Classroom read-only API adapter.
 * Access tokens MUST be retrieved for the current authenticated user,
 * never supplied by arbitrary unauthenticated MCP requests.
 */
export interface ClassroomCourse {
  id: string;
  name: string;
  section?: string;
  courseState?: string;
}
export interface ClassroomAssignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  workType?: string;
  alternateLink?: string;
  materials?: unknown[];
}
export interface ClassroomTeacher { userId:string; name:string }
export async function listTeachers(token:string,courseId:string):Promise<{status:'available'|'permission_required';teachers:ClassroomTeacher[]}> {
  if (!/^[-\w]{1,256}$/.test(courseId)) throw new Error('Invalid course id');
  const teachers:ClassroomTeacher[]=[];
  let pageToken:string|undefined;
  for(let page=0;page<10;page++) {
    const q=new URLSearchParams({pageSize:'100',fields:'teachers(userId,profile(name(fullName))),nextPageToken'});
    if(pageToken)q.set('pageToken',pageToken);
    if(!token || /[\r\n]/.test(token))throw new Error('Invalid access token');
    const response=await fetch('https://classroom.googleapis.com/v1/courses/'+encodeURIComponent(courseId)+'/teachers?'+q,{
      headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(15000)});
    // A 403 can also mean domain restrictions or quota, not just a missing scope.
    if(response.status===403)return {status:'permission_required',teachers:[]};
    if(!response.ok)throw new Error('Teacher lookup unavailable');
    const data=await response.json() as {teachers?:Array<{userId:string;profile?:{name?:{fullName?:string}}}>;nextPageToken?:string};
    for(const t of data.teachers??[])if(t.profile?.name?.fullName?.trim())teachers.push({userId:t.userId,name:t.profile.name.fullName.trim()});
    pageToken=data.nextPageToken;if(!pageToken)return {status:'available',teachers};
  }
  throw new Error('Teacher pagination limit reached');
}
async function apiGet<T>(path: string, token: string): Promise<T> {
  if (!token || /[\r\n]/.test(token)) throw new Error("Invalid access token");
  const response = await fetch("https://classroom.googleapis.com/v1/" + path, {
    headers: { authorization: "Bearer " + token, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error("Google access token expired or revoked");
  if (response.status === 403) throw new Error("Classroom permission denied or quota exceeded");
  if (!response.ok) throw new Error("Google Classroom API request failed: " + response.status);
  return (await response.json()) as T;
}
export async function getAssignment(token: string, courseId: string, assignmentId: string): Promise<ClassroomAssignment> {
  if (![courseId,assignmentId].every(id=>/^[-\w]{1,256}$/.test(id))) throw new Error('Invalid assignment id');
  return apiGet<ClassroomAssignment>('courses/'+encodeURIComponent(courseId)+'/courseWork/'+encodeURIComponent(assignmentId),token);
}
export async function listCourses(token: string): Promise<ClassroomCourse[]> {
  const results: ClassroomCourse[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const response = await apiGet<{ courses?: ClassroomCourse[]; nextPageToken?: string }>(
      "courses?" + q, token);
    results.push(...(response.courses ?? []));
    pageToken = response.nextPageToken;
    if (!pageToken) return results;
  }
  throw new Error("Course pagination limit reached");
}
export async function listAssignments(token: string, courseId: string): Promise<ClassroomAssignment[]> {
  if (!/^[-\w]+$/.test(courseId)) throw new Error("Invalid course id");
  const results: ClassroomAssignment[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const response = await apiGet<{ courseWork?: ClassroomAssignment[]; nextPageToken?: string }>(
      "courses/" + encodeURIComponent(courseId) + "/courseWork?" + q, token);
    results.push(...(response.courseWork ?? []));
    pageToken = response.nextPageToken;
    if (!pageToken) return results;
  }
  throw new Error("Assignment pagination limit reached");
}
