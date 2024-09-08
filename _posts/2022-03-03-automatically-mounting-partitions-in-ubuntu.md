---
layout: post
title:  "Automatically Mounting Partitions in Ubuntu"
date:   2022-03-03 09:00:00 +0530
categories: coding
comments: false
---

If you have many partitions of your disk then you can see that when you start Ubuntu all partitions doesn't get mounted automatically. If you want all of your partitions or a particular partition to be mounted automatically, it can be done easily with method given below (Taken from Ubuntu documentation).
First of all run following command in terminal to list the partition table of all disks present on your computer:

```
user@ubuntu:~$ sudo fdisk -l

Disk /dev/sda: 500.1 GB, 500107862016 bytes
255 heads, 63 sectors/track, 60801 cylinders, total 976773168 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk identifier: 0x1276c8c9

   Device Boot      Start         End      Blocks   Id  System
/dev/sda1   *        2048      206847      102400    7  HPFS/NTFS/exFAT
/dev/sda2          206848   209922047   104857600    7  HPFS/NTFS/exFAT
/dev/sda3       209922048   914837489   352457721    7  HPFS/NTFS/exFAT
/dev/sda4       914837490   976768064    30965287+   7  HPFS/NTFS/exFAT
user@ubuntu:~$
```

This command displays all of your partitions on all disks. First column named 'Device' is your partition. The last column displays the System name of your partition. The following table displays the System name to linux type of some common System types:

| System Name     | English Name                          | Linux Type |
|-----------------|---------------------------------------|------------|
| W95 FAT32       | Microsoft FAT32                       | vfat       |
| W95 FAT32 (LBA) | Microsoft FAT32                       | vfat       |
| W95 FAT16 (LBA) | Microsoft FAT16                       | vfat       |
| W95 Ext’d (LBA) | Microsoft extended partition          | Not used   |
| NTFS volume set | Microsoft NTFS                        | ntfs       |
| NTFS volume set | Microsoft NTFS with read-write access | ntfs-3g    |
| Apple_HFS       | Apple HFS                             | hfsplus    |

Now our next step is to create location where we want to mount our partitions. For this purpose run following commands in terminal:

```
user@ubuntu:~$ sudo mkdir /media/a 
```

For all partitions you want to mount and replace 'a' with the name you want to give your partition mount location.
Now our next step is to edit Ubuntu's file system table. To do this run following command in terminal:

```
user@ubuntu:~$ sudo gedit /etc/fstab 
```

and place following line at the end of file:

```
/dev/sda3  /media/a  ntfs  user,fmask=0111,dmask=0000  0  0
```

Here replace `/dev/sda3` with your 'Device' name, `/media/a` with the path you created for mounting your disk, 'ntfs' with 'Linux type' of your partition `user,fmask=0111,dmask=0000` is additional option for permissions of partition for 'ntfs' type partition. You can replace it with according to your partition type using table below:

| Description          | Accessible by everyone                           | Accessible by a subset of users                           |
|----------------------|--------------------------------------------------|-----------------------------------------------------------|
| FAT(16/32) partition | `user,auto,fmask=0111,`<br>`dmask=0000`          | `user,auto,fmask=0177,`<br>`dmask=0077,uid=1000`          |
| NTFS partition       | `rw,auto,user,fmask=0111,`<br>`dmask=0000`       | `rw,user,auto,fmask=0177,`<br>`dmask=0077,uid=1000`       |
| Apple Partition      | `user,auto,file_umask=0111,`<br>`dir_umask=0000` | `user,auto,file_umask=0177,`<br>`dir_umask=0077,uid=1000` |

For more on these options see `man mount`.
Now restart your system and see all partitions you want have been mounted automatically. :)
