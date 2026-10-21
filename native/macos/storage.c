#include <errno.h>
#include <dirent.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <CommonCrypto/CommonDigest.h>
#include <Security/Security.h>

static void fail(void) {
  int code = errno ? errno : EINVAL;
  fprintf(stderr, "{\"errno\":%d}\n", code);
  exit(1);
}

static void require(int condition) {
  if (!condition) { errno = EINVAL; fail(); }
}

/* Resolve every directory through descriptors; no intermediate symlink is followed. */
static int directory(int base, const char *path) {
  int fd = dup(base);
  if (fd < 0) fail();
  if (!*path) return fd;
  char *copy = strdup(path);
  if (!copy) fail();
  char *part = copy;
  for (;;) {
    char *slash = strchr(part, '/');
    if (slash) *slash = '\0';
    require(*part && strcmp(part, ".") && strcmp(part, ".."));
    int next = openat(fd, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (next < 0) fail();
    close(fd);
    fd = next;
    if (!slash) break;
    part = slash + 1;
  }
  free(copy);
  return fd;
}

static int parent(int root, const char *path, char **name) {
  require(*path && *path != '/');
  char *copy = strdup(path);
  if (!copy) fail();
  char *slash = strrchr(copy, '/');
  int fd;
  if (slash) {
    *slash = '\0';
    fd = directory(root, copy);
    *name = strdup(slash + 1);
  } else {
    fd = dup(root);
    *name = strdup(copy);
  }
  free(copy);
  if (fd < 0 || !*name) fail();
  require(**name && strcmp(*name, ".") && strcmp(*name, ".."));
  return fd;
}

static void sync_directory(int fd) {
  if (fsync(fd) < 0 || fcntl(fd, F_FULLFSYNC) < 0) fail();
}

static void regular(int fd) {
  struct stat info;
  if (fstat(fd, &info) < 0) fail();
  require(S_ISREG(info.st_mode) && info.st_nlink == 1);
}

static void copy_bytes(int from, int to) {
  unsigned char buffer[65536];
  for (;;) {
    ssize_t count = read(from, buffer, sizeof(buffer));
    if (count < 0) { if (errno == EINTR) continue; fail(); }
    if (!count) return;
    ssize_t offset = 0;
    while (offset < count) {
      ssize_t written = write(to, buffer + offset, (size_t)(count - offset));
      if (written < 0) { if (errno == EINTR) continue; fail(); }
      if (!written) { errno = EIO; fail(); }
      offset += written;
    }
  }
}

static void write_owner(int fd, const char *text) {
  size_t length = strlen(text), offset = 0;
  require(length > 0 && length < 4096);
  while (offset < length) {
    ssize_t count = pwrite(fd, text + offset, length - offset, (off_t)offset);
    if (count < 0) { if (errno == EINTR) continue; fail(); }
    if (!count) { errno = EIO; fail(); }
    offset += (size_t)count;
  }
  if (ftruncate(fd, (off_t)length) < 0 || fsync(fd) < 0 || fcntl(fd, F_FULLFSYNC) < 0) fail();
}

/* Keep an orphaned mutation inside its ownership epoch until it exits. */
static int activity_lock(int root, int mode) {
  int locks = directory(root, "locks");
  int fd = openat(locks, "project-activity.lock", O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd < 0) fail();
  regular(fd);
  if (flock(fd, mode) < 0) fail();
  sync_directory(locks);
  close(locks);
  return fd;
}

static void verify_owner(int root, const char *expected) {
  int locks = directory(root, "locks");
  int fd = openat(locks, "project-write.lock", O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) fail();
  regular(fd);
  char bytes[4096];
  ssize_t length = pread(fd, bytes, sizeof(bytes), 0);
  if (length < 0) fail();
  if ((size_t)length != strlen(expected) || memcmp(bytes, expected, (size_t)length)) {
    errno = ESTALE; fail();
  }
  close(fd);
  close(locks);
}

/* Hash and unlink only the managed regular file that was inspected. */
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
static void remove_verified(int source, const char *name, const char *size_text, const char *digest) {
  require(strlen(digest) == CC_SHA256_DIGEST_LENGTH * 2);
  char *end;
  errno = 0;
  unsigned long long size = strtoull(size_text, &end, 10);
  require(!errno && *size_text && size_text[0] != '-' && !*end && size <= 9007199254740991ULL);
  int fd = openat(source, name, O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) fail();
  regular(fd);
  struct stat before, after, named;
  if (fstat(fd, &before) < 0) fail();
  require((unsigned long long)before.st_size == size);
  CC_SHA256_CTX hash;
  require(CC_SHA256_Init(&hash));
  unsigned char buffer[65536], bytes[CC_SHA256_DIGEST_LENGTH];
  unsigned long long total = 0;
  for (;;) {
    ssize_t count = read(fd, buffer, sizeof(buffer));
    if (count < 0) { if (errno == EINTR) continue; fail(); }
    if (!count) break;
    total += (unsigned long long)count;
    require(total <= size && CC_SHA256_Update(&hash, buffer, (CC_LONG)count));
  }
  require(total == size && CC_SHA256_Final(bytes, &hash));
  char actual[CC_SHA256_DIGEST_LENGTH * 2 + 1];
  for (size_t i = 0; i < sizeof(bytes); i++) snprintf(actual + i * 2, 3, "%02x", bytes[i]);
  require(!strcmp(actual, digest));
  if (fstat(fd, &after) < 0 || fstatat(source, name, &named, AT_SYMLINK_NOFOLLOW) < 0) fail();
  require(S_ISREG(named.st_mode) && named.st_nlink == 1 && named.st_dev == before.st_dev && named.st_ino == before.st_ino &&
    after.st_size == before.st_size && after.st_mtimespec.tv_sec == before.st_mtimespec.tv_sec &&
    after.st_mtimespec.tv_nsec == before.st_mtimespec.tv_nsec && after.st_ctimespec.tv_sec == before.st_ctimespec.tv_sec &&
    after.st_ctimespec.tv_nsec == before.st_ctimespec.tv_nsec);
  /* Move into a fresh private namespace before deleting. If the named entry
     raced with verification, preserve the quarantined entry and fail closed. */
  unsigned char nonce[16];
  arc4random_buf(nonce, sizeof(nonce));
  char quarantine[80] = ".timeline-studio-remove-";
  size_t prefix = strlen(quarantine);
  for (size_t i = 0; i < sizeof(nonce); i++) snprintf(quarantine + prefix + i * 2, 3, "%02x", nonce[i]);
  if (mkdirat(source, quarantine, 0700) < 0) fail();
  int isolated = openat(source, quarantine, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (isolated < 0) fail();
  if (renameatx_np(source, name, isolated, "object", RENAME_EXCL) < 0) fail();
  sync_directory(isolated); sync_directory(source);
  if (fstatat(isolated, "object", &named, AT_SYMLINK_NOFOLLOW) < 0) fail();
  require(S_ISREG(named.st_mode) && named.st_nlink == 1 && named.st_dev == before.st_dev &&
    named.st_ino == before.st_ino && named.st_size == before.st_size &&
    named.st_mtimespec.tv_sec == before.st_mtimespec.tv_sec && named.st_mtimespec.tv_nsec == before.st_mtimespec.tv_nsec);
  if (unlinkat(isolated, "object", 0) < 0) fail();
  sync_directory(isolated); close(isolated);
  if (unlinkat(source, quarantine, AT_REMOVEDIR) < 0) fail();
  sync_directory(source);
  close(fd);
}
#pragma clang diagnostic pop

static int credential(const char *operation, const char *account) {
  require(strlen(account) == 64 && strspn(account, "0123456789abcdef") == 64);
  CFStringRef identity = CFStringCreateWithCString(NULL, account, kCFStringEncodingUTF8);
  require(identity != NULL);
  const void *keys[] = { kSecClass, kSecAttrService, kSecAttrAccount };
  const void *values[] = { kSecClassGenericPassword, CFSTR("TimelineStudio.planning"), identity };
  CFMutableDictionaryRef query = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  require(query != NULL);
  for (size_t i = 0; i < 3; i++) CFDictionarySetValue(query, keys[i], values[i]);
  OSStatus status;
  if (!strcmp(operation, "credential-put")) {
    unsigned char secret[16385];
    size_t length = 0;
    for (;;) {
      require(length < sizeof(secret));
      ssize_t count = read(STDIN_FILENO, secret + length, sizeof(secret) - length);
      if (count < 0) { if (errno == EINTR) continue; fail(); }
      if (!count) break;
      length += (size_t)count;
    }
    require(length > 0 && length <= 16384);
    CFDataRef data = CFDataCreate(NULL, secret, (CFIndex)length);
    volatile unsigned char *wipe = secret;
    for (size_t i = 0; i < sizeof(secret); i++) wipe[i] = 0;
    require(data != NULL);
    const void *updateKeys[] = { kSecValueData };
    const void *updateValues[] = { data };
    CFDictionaryRef update = CFDictionaryCreate(NULL, updateKeys, updateValues, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    require(update != NULL);
    status = SecItemUpdate(query, update);
    if (status == errSecItemNotFound) {
      CFDictionarySetValue(query, kSecValueData, data);
      status = SecItemAdd(query, NULL);
    }
    CFRelease(update); CFRelease(data);
  } else {
    require(!strcmp(operation, "credential-get") || !strcmp(operation, "credential-status"));
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
    CFDictionarySetValue(query, !strcmp(operation, "credential-get") ? kSecReturnData : kSecReturnAttributes, kCFBooleanTrue);
    CFTypeRef result = NULL;
    status = SecItemCopyMatching(query, &result);
    if (status == errSecSuccess) {
      if (!strcmp(operation, "credential-get")) {
        require(result && CFGetTypeID(result) == CFDataGetTypeID());
        CFDataRef data = (CFDataRef)result;
        CFIndex length = CFDataGetLength(data);
        require(length > 0 && length <= 16384);
        size_t offset = 0;
        while (offset < (size_t)length) {
          ssize_t count = write(STDOUT_FILENO, CFDataGetBytePtr(data) + offset, (size_t)length - offset);
          if (count < 0) { if (errno == EINTR) continue; fail(); }
          require(count > 0); offset += (size_t)count;
        }
      } else puts("true");
    } else if (status == errSecItemNotFound && !strcmp(operation, "credential-status")) {
      puts("false"); status = errSecSuccess;
    }
    if (result) CFRelease(result);
  }
  CFRelease(query); CFRelease(identity);
  if (status != errSecSuccess) { fprintf(stderr, "{\"keychainStatus\":%d}\n", (int)status); return 1; }
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 3 && (!strcmp(argv[1], "credential-put") || !strcmp(argv[1], "credential-get") || !strcmp(argv[1], "credential-status"))) {
    return credential(argv[1], argv[2]);
  }
  require(argc == 4 || argc == 5 || argc == 6 || argc == 7);
  const char *operation = argv[1];
  require(argv[2][0] == '/');
  int filesystem = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (filesystem < 0) fail();
  int root = directory(filesystem, argv[2] + 1);
  close(filesystem);
  int activity = -1;
  const char *owner = getenv("TIMELINE_STUDIO_STORAGE_OWNER");
  int mutation = !strcmp(operation, "mkdir") || !strcmp(operation, "write") || !strcmp(operation, "publish") ||
    !strcmp(operation, "replace") || !strcmp(operation, "remove") || !strcmp(operation, "sync");
  if (mutation && (!owner || !*owner)) {
    struct stat managed;
    if (fstatat(root, "locks/project-write.lock", &managed, AT_SYMLINK_NOFOLLOW) == 0) {
      /* Reopening a managed project may ensure its existing locks directory
         before acquiring ownership. No other unowned mutation is permitted. */
      if (strcmp(operation, "mkdir") || strcmp(argv[3], "locks")) { errno = EACCES; fail(); }
    } else if (errno != ENOENT) fail();
  }
  if (owner && *owner && (!strcmp(operation, "mkdir") || !strcmp(operation, "write") ||
      !strcmp(operation, "publish") || !strcmp(operation, "replace") || !strcmp(operation, "remove") || !strcmp(operation, "sync"))) {
    activity = activity_lock(root, LOCK_EX);
    verify_owner(root, owner);
  }
  char *name;
  int source = parent(root, argv[3], &name);

  if (!strcmp(operation, "mkdir")) {
    require(argc == 4);
    if (mkdirat(source, name, 0700) < 0 && errno != EEXIST) fail();
    int fd = openat(source, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail();
    sync_directory(fd);
    sync_directory(source);
    close(fd);
  } else if (!strcmp(operation, "write")) {
    require(argc == 4);
    int fd = openat(source, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd < 0) fail();
    regular(fd);
    copy_bytes(STDIN_FILENO, fd);
    if (fsync(fd) < 0 || fcntl(fd, F_FULLFSYNC) < 0) fail();
    if (close(fd) < 0) fail();
    sync_directory(source);
  } else if (!strcmp(operation, "sync")) {
    require(argc == 4 && owner && *owner);
    int fd = openat(source, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail();
    regular(fd);
    if (fsync(fd) < 0 || fcntl(fd, F_FULLFSYNC) < 0) fail();
    if (close(fd) < 0) fail();
    sync_directory(source);
    /* Recovery must also persist the directory entries leading to this file. */
    char *ancestor = strdup(argv[3]);
    if (!ancestor) fail();
    char *slash;
    while ((slash = strrchr(ancestor, '/')) != NULL) {
      *slash = '\0';
      char *parent_name;
      int parent_fd = parent(root, ancestor, &parent_name);
      sync_directory(parent_fd);
      close(parent_fd);
      free(parent_name);
    }
    free(ancestor);
  } else if (!strcmp(operation, "remove")) {
    require(argc == 6 && owner && *owner);
    remove_verified(source, name, argv[4], argv[5]);
  } else if (!strcmp(operation, "list")) {
    require(argc == 4);
    int fd = openat(source, name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail();
    DIR *stream = fdopendir(fd);
    if (!stream) fail();
    for (;;) {
      errno = 0;
      struct dirent *entry = readdir(stream);
      if (!entry) { if (errno) fail(); break; }
      if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
      if (fwrite(entry->d_name, 1, strlen(entry->d_name) + 1, stdout) != strlen(entry->d_name) + 1) fail();
    }
    if (closedir(stream) < 0) fail();
  } else if (!strcmp(operation, "read") || !strcmp(operation, "readrange")) {
    require(argc == (!strcmp(operation, "read") ? 4 : 6));
    int fd = openat(source, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) fail();
    regular(fd);
    if (argc == 4) copy_bytes(fd, STDOUT_FILENO);
    else {
      char *end;
      errno = 0;
      unsigned long long start = strtoull(argv[4], &end, 10);
      require(!errno && *argv[4] && argv[4][0] != '-' && !*end && start <= 9007199254740991ULL);
      unsigned long long length = strtoull(argv[5], &end, 10);
      require(!errno && *argv[5] && argv[5][0] != '-' && !*end && length <= 9007199254740991ULL);
      struct stat info;
      if (fstat(fd, &info) < 0) fail();
      require(start <= (unsigned long long)info.st_size && length <= (unsigned long long)info.st_size - start);
      if (lseek(fd, (off_t)start, SEEK_SET) < 0) fail();
      unsigned char buffer[65536];
      while (length) {
        size_t wanted = length < sizeof(buffer) ? (size_t)length : sizeof(buffer);
        ssize_t count = read(fd, buffer, wanted);
        if (count < 0) { if (errno == EINTR) continue; fail(); }
        if (!count) { errno = EIO; fail(); }
        size_t offset = 0;
        while (offset < (size_t)count) {
          ssize_t written = write(STDOUT_FILENO, buffer + offset, (size_t)count - offset);
          if (written < 0) { if (errno == EINTR) continue; fail(); }
          if (!written) { errno = EIO; fail(); }
          offset += (size_t)written;
        }
        length -= (unsigned long long)count;
      }
    }
    close(fd);
  } else if (!strcmp(operation, "publish") || !strcmp(operation, "replace")) {
    require(argc == 5);
    char *target_name;
    int target = parent(root, argv[4], &target_name);
    struct stat info;
    if (fstatat(source, name, &info, AT_SYMLINK_NOFOLLOW) < 0) fail();
    require(S_ISDIR(info.st_mode) || (S_ISREG(info.st_mode) && info.st_nlink == 1));
    if (!strcmp(operation, "replace")) {
      require(S_ISREG(info.st_mode));
      if (fstatat(target, target_name, &info, AT_SYMLINK_NOFOLLOW) == 0) {
        require(S_ISREG(info.st_mode) && info.st_nlink == 1);
      } else if (errno != ENOENT) fail();
    }
    unsigned flags = !strcmp(operation, "publish") ? RENAME_EXCL : 0;
    if (renameatx_np(source, name, target, target_name, flags) < 0) fail();
    sync_directory(target);
    sync_directory(source);
    close(target);
    free(target_name);
  } else if (!strcmp(operation, "lock")) {
    require(argc == 7);
    int fd = openat(source, name, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd < 0 && errno == EEXIST) {
      fd = openat(source, name, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
    }
    if (fd < 0) fail();
    regular(fd);
    if (flock(fd, LOCK_EX | LOCK_NB) < 0) fail();
    int takeover = activity_lock(root, LOCK_EX | LOCK_NB);
    char previous[4096];
    ssize_t previous_length = pread(fd, previous, sizeof(previous), 0);
    if (previous_length < 0) fail();
    require((size_t)previous_length == strlen(argv[4]) &&
      !memcmp(previous, argv[4], (size_t)previous_length));
    write_owner(fd, argv[5]);
    sync_directory(source);
    close(takeover);
    puts("{\"locked\":true}");
    fflush(stdout);
    /* The host owns this pipe. EOF, including host death, releases the kernel lock. */
    char byte;
    int clean_release = 0;
    for (;;) {
      ssize_t count = read(STDIN_FILENO, &byte, 1);
      if (count == 0) break;
      if (count < 0 && errno != EINTR) fail();
      if (count > 0) { require(byte == 'R' && !clean_release); clean_release = 1; }
    }
    if (clean_release) {
      int releasing = activity_lock(root, LOCK_EX);
      write_owner(fd, argv[6]);
      close(releasing);
    }
    close(fd);
  } else {
    errno = EINVAL;
    fail();
  }
  close(source);
  if (activity >= 0) close(activity);
  close(root);
  free(name);
  return 0;
}
